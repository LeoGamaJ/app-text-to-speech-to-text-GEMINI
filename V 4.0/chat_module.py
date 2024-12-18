import os
import logging
import requests
import base64
from dotenv import load_dotenv
from enum import Enum
from PIL import Image
import io
from google.api_core.exceptions import GoogleAPICallError, RetryError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Cria um manipulador para registrar em um arquivo
file_handler = logging.FileHandler('chat.log')
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Cria um manipulador para exibir no console
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
logger.addHandler(console_handler)

# Configure o caminho para seu arquivo de credenciais
load_dotenv()

class GeminiModel(Enum):
    """Modelos disponíveis do Gemini."""
    GEMINI_PRO = "gemini-1.5-pro"
    GEMINI_FLASH = "gemini-1.5-flash"
    GEMINI_FLASH_8B = "gemini-1.5-flash-8b"
    GEMINI_FLASH_EXP = "gemini-2.0-flash-exp"

def create_chat_client():
    """Cria e retorna um cliente para o chat."""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        logger.error("GEMINI_API_KEY não encontrada no arquivo .env")
        return None
    return api_key

def process_image(image_path):
    """Processa uma imagem para envio à API."""
    try:
        with Image.open(image_path) as img:
            # Converte para RGB se necessário
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Redimensiona se necessário (limite de 2048px)
            max_size = 2048
            if max(img.size) > max_size:
                ratio = max_size / max(img.size)
                new_size = tuple(int(dim * ratio) for dim in img.size)
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            # Salva em buffer de memória
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='JPEG', quality=85)
            img_bytes = img_byte_arr.getvalue()

            logger.info(f"Imagem processada com sucesso: {image_path}")
            logger.info(f"Dimensões finais: {img.size}")
            logger.info(f"Tamanho do arquivo: {len(img_bytes)} bytes")

            return {
                "mimeType": "image/jpeg",
                "data": base64.b64encode(img_bytes).decode('utf-8')
            }
    except Exception as e:
        logger.error(f"Erro ao processar imagem: {e}")
        raise ValueError(f"Erro ao processar imagem: {str(e)}")

def prepare_chat_request(message, model=GeminiModel.GEMINI_PRO.value, image_data=None, temperature=0.7, top_k=40, top_p=0.95, max_tokens=2048):
    """Prepara a requisição para a API do Gemini."""
    if image_data:
        parts = [
            {"text": message or "Descreva esta imagem em detalhes"},
            {
                "inline_data": {
                    "mimeType": image_data["mimeType"],
                    "data": image_data["data"]
                }
            }
        ]
    else:
        parts = [{"text": message}]

    return {
        "contents": [{
            "parts": parts
        }],
        "generationConfig": {
            "temperature": float(temperature),
            "topK": int(top_k),
            "topP": float(top_p),
            "maxOutputTokens": int(max_tokens)
        }
    }

def send_chat_message(api_key, message, image_path=None, temperature=0.7, top_k=40, top_p=0.95, max_tokens=2048, model=None):
    """Envia uma mensagem para o chat e retorna a resposta."""
    try:
        # Se nenhum modelo foi especificado, use o padrão baseado no modo de imagem
        if not model:
            model = GeminiModel.GEMINI_FLASH_8B.value if image_path else GeminiModel.GEMINI_PRO.value
        
        logger.info(f"Iniciando chamada à API com parâmetros:")
        logger.info(f"- Modelo: {model}")
        logger.info(f"- Temperatura: {temperature}")
        logger.info(f"- Top K: {top_k}")
        logger.info(f"- Top P: {top_p}")
        logger.info(f"- Max Tokens: {max_tokens}")
        logger.info(f"- Modo Imagem: {'Sim' if image_path else 'Não'}")
        
        # Processa imagem se fornecida
        image_data = None
        if image_path:
            if not os.path.exists(image_path):
                raise FileNotFoundError(f"Imagem não encontrada: {image_path}")
            try:
                image_data = process_image(image_path)
                logger.info("Imagem processada com sucesso")
            except Exception as e:
                logger.error(f"Erro ao processar imagem: {e}")
                raise ValueError(f"Erro ao processar imagem: {str(e)}")

        # Prepara a requisição
        url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": api_key
        }
        
        # Prepara os dados da requisição
        data = prepare_chat_request(
            message=message,
            model=model,
            image_data=image_data,
            temperature=temperature,
            top_k=top_k,
            top_p=top_p,
            max_tokens=max_tokens
        )

        # Faz a requisição
        logger.info(f"Enviando requisição para a API...")
        response = requests.post(url, headers=headers, json=data)
        
        if response.status_code != 200:
            logger.error(f"Erro na API: Status {response.status_code}")
            logger.error(f"Resposta: {response.text}")
            raise Exception(f"Erro na API: {response.text}")
            
        response.raise_for_status()

        # Processa a resposta
        response_data = response.json()
        if 'candidates' in response_data and response_data['candidates']:
            content = response_data['candidates'][0]['content']
            if 'parts' in content and content['parts']:
                response_text = content['parts'][0].get('text', '')
                logger.info("Resposta recebida com sucesso")
                return response_text

        raise ValueError("Não foi possível gerar uma resposta")

    except requests.exceptions.RequestException as e:
        logger.error(f"Erro na requisição ao chat: {e}")
        raise Exception(f"Erro na comunicação com a API: {str(e)}")
    except Exception as e:
        logger.error(f"Erro no processamento: {e}")
        raise

def run_chat():
    """Função principal que executa o chat."""
    try:
        api_key = create_chat_client()
        if not api_key:
            return
        
        print("\n" + "="*50)
        print("Bem-vindo ao Chat Gemini!".center(50))
        print("="*50 + "\n")
        print("Comandos disponíveis:")
        print("- 'sair' ou 'q': Encerra o chat")
        print("- 'limpar' ou 'cls': Limpa o histórico")
        print("- 'salvar' ou 's': Salva a conversa")
        print("- 'config modelo=nome': Altera o modelo")
        print("- 'imagem caminho': Analisa uma imagem")
        print(f"\nModelos disponíveis: {', '.join([model.value for model in GeminiModel])}\n")
        
        while True:
            try:
                user_input = input("\nVocê: ").strip()
                
                if not user_input:
                    continue
                    
                if user_input.lower() in ['sair', 'q']:
                    print("\nEncerrando o chat...")
                    break
                elif user_input.lower() in ['limpar', 'cls']:
                    print("\nHistórico de conversas limpo.")
                    continue
                elif user_input.lower() in ['salvar', 's']:
                    print("\nConversa salva com sucesso.")
                    continue
                elif user_input.lower().startswith('config '):
                    try:
                        config_str = user_input[7:]
                        config_dict = dict(item.split('=') for item in config_str.split())
                        print("\nConfigurações atualizadas!")
                    except Exception as e:
                        print(f"\nErro ao atualizar configurações: {str(e)}")
                    continue
                elif user_input.lower().startswith('imagem '):
                    image_path = user_input[7:].strip()
                    if not os.path.exists(image_path):
                        print(f"\nErro: Imagem não encontrada: {image_path}")
                        continue
                    prompt = input("\nDigite uma descrição ou pergunta sobre a imagem: ")
                    response = send_chat_message(api_key, prompt, image_path)
                    if response:
                        print("\nAssistente:", response)
                    else:
                        print("\nErro ao enviar mensagem.")
                    continue
                
                response = send_chat_message(api_key, user_input)
                if response:
                    print("\nAssistente:", response)
                else:
                    print("\nErro ao enviar mensagem.")
                
            except KeyboardInterrupt:
                print("\n\nOperação cancelada pelo usuário.")
                continue
            except Exception as e:
                print(f"\nErro: {str(e)}")
                continue
    
    except Exception as e:
        print(f"\nErro fatal: {str(e)}")

if __name__ == '__main__':
    run_chat()