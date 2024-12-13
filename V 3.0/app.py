import os
import logging
import xml.etree.ElementTree as ET
from google.cloud import texttospeech, speech_v1p1beta1 as speech
from google.api_core.exceptions import GoogleAPICallError, RetryError
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from datetime import datetime
import io
import json
from dotenv import load_dotenv
import chat_module
import requests

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Cria um manipulador para registrar em um arquivo
file_handler = logging.FileHandler('app.log')
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Cria um manipulador para exibir no console
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
logger.addHandler(console_handler)

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

# Configure o caminho para o arquivo de credenciais JSON
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'credential_stt_gcp.json')

# Inicializa o aplicativo Flask
app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Altere para uma chave secreta segura

# Listas para armazenar o histórico (separadas para TTS e STT)
history_tts = []
history_stt = []

# Variável global para controlar os IDs dos registros
next_record_id = 1

# Funções auxiliares (usadas por TTS e STT)
def create_tts_client():
    """Cria e retorna um cliente TTS."""
    return texttospeech.TextToSpeechLongAudioSynthesizeClient()

def create_stt_client():
    """Cria e retorna um cliente STT."""
    return speech.SpeechClient()

# Funções específicas para TTS
def prepare_audio_config():
    """Prepara a configuração de áudio para TTS."""
    return texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.LINEAR16)

def prepare_voice_params():
    """Prepara os parâmetros de voz para TTS."""
    return texttospeech.VoiceSelectionParams(
        language_code="pt-BR",
        name="pt-BR-Wavenet-B"
    )

def validate_ssml(ssml):
    """Valida se o SSML está bem formado."""
    try:
        ET.fromstring(ssml)
        logger.info("SSML is valid.")
        return True
    except ET.ParseError as e:
        logger.error(f"Invalid SSML: {e}")
        return False

def synthesize_long_audio(client, project_id, location, output_gcs_uri, ssml):
    """Sintetiza áudio longo, escrevendo o resultado no GCS."""
    if not validate_ssml(ssml):
        logger.error("SSML validation failed. Aborting synthesis.")
        return None

    input_text = texttospeech.SynthesisInput(ssml=ssml)
    audio_config = prepare_audio_config()
    voice = prepare_voice_params()

    parent = f"projects/{project_id}/locations/{location}"

    request = texttospeech.SynthesizeLongAudioRequest(
        parent=parent,
        input=input_text,
        audio_config=audio_config,
        voice=voice,
        output_gcs_uri=output_gcs_uri,
    )

    logger.info(f"Starting synthesis for project: {project_id}, location: {location}, output GCS URI: {output_gcs_uri}")

    try:
        operation = client.synthesize_long_audio(request=request)
        operation.result(timeout=300)
        logger.info("Finished processing, check your GCS bucket to find your audio file!")
        return output_gcs_uri
    except (GoogleAPICallError, RetryError) as e:
        logger.error(f"Failed to synthesize audio: {e}")
        return None

# Funções específicas para STT
def transcribe_audio(client, gcs_uri):
    """Transcreve o áudio fornecido em um URI do Google Cloud Storage."""
    audio = speech.RecognitionAudio(uri=gcs_uri)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.FLAC,
        sample_rate_hertz=44100,
        audio_channel_count=2,  # Define explicitamente 2 canais de áudio 
        language_code="pt-BR",
        enable_word_time_offsets=True 
    )

    try:
        logger.info(f"Iniciando a transcrição do áudio em: {gcs_uri}")
        response = client.long_running_recognize(config=config, audio=audio)
        logger.info("Transcrição iniciada, aguardando resultados...")
        result = response.result(timeout=300)

        transcripts = []
        for result in result.results:
            transcripts.append(result.alternatives[0].transcript)

        logger.info("Transcrição concluída com sucesso!")
        return transcripts
    except (GoogleAPICallError, RetryError) as e:
        logger.error(f"Erro ao transcrever áudio: {e}")
        return []

def format_transcribed_text(text):
    """Formata o texto transcrito usando regras básicas de pontuação."""
    try:
        # Tenta usar a API Gemini primeiro
        api_key = os.getenv('GEMINI_API_KEY')
        if api_key:
            prompt = f"""
            Por favor, formate o seguinte texto transcrito de áudio para melhorar sua legibilidade:
            1. Adicione pontuação adequada (vírgulas, pontos, etc.)
            2. Corrija a capitalização das palavras
            3. Organize em parágrafos quando apropriado
            4. Mantenha o significado original do texto
            5. Não altere ou remova palavras

            Texto original:
            {text}
            """

            url = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent"
            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": api_key
            }

            data = {
                "contents": [{
                    "role": "user",
                    "parts": [{"text": prompt}]
                }]
            }

            try:
                response = requests.post(url, headers=headers, json=data)
                response.raise_for_status()
                return response.json()['candidates'][0]['content']['parts'][0]['text']
            except:
                logger.error("Erro ao chamar API Gemini, usando formatação local")
                # Se falhar, continua para a formatação local
        
        # Formatação local básica
        import re
        
        # 1. Adiciona espaço após pontuação
        text = re.sub(r'([.!?])([A-Z])', r'\1 \2', text)
        
        # 2. Capitaliza início de frases
        sentences = re.split('([.!?] )', text)
        formatted_text = ''
        for i in range(0, len(sentences), 2):
            if i < len(sentences):
                sentence = sentences[i].strip()
                if sentence:
                    sentence = sentence[0].upper() + sentence[1:]
                    formatted_text += sentence
                if i + 1 < len(sentences):
                    formatted_text += sentences[i + 1]
        
        # 3. Adiciona pontos finais onde necessário
        formatted_text = re.sub(r'([a-z])\s+([A-Z])', r'\1. \2', formatted_text)
        
        # 4. Corrige espaçamento
        formatted_text = re.sub(r'\s+', ' ', formatted_text).strip()
        
        # 5. Garante ponto final
        if not formatted_text.endswith(('.', '!', '?')):
            formatted_text += '.'
        
        return formatted_text

    except Exception as e:
        logger.error(f"Erro ao formatar texto: {e}")
        return text

# Rotas do Flask
@app.route('/index_tts.html', methods=['GET', 'POST'])
def index_tts():
    global next_record_id
    if request.method == 'POST':
        if 'ssml_file_path' not in request.files:
            return jsonify({'error': 'Nenhum arquivo selecionado.'}), 400
            
        file = request.files['ssml_file_path']
        if file.filename == '':
            return jsonify({'error': 'Nenhum arquivo selecionado.'}), 400

        if file:
            try:
                ssml_text = file.read().decode('utf-8')
                if not validate_ssml(ssml_text):
                    return jsonify({'error': 'SSML inválido. Verifique a sintaxe do arquivo.'}), 400

                client = create_tts_client()
                project_id = os.getenv('PROJECT_ID', "pragmatic-aegis-436316-m4")
                location = os.getenv('LOCATION', "us-east1")
                output_file_name = f"tts_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.wav"
                output_gcs_uri = f"gs://b_txt_speech/{output_file_name}"

                download_link = synthesize_long_audio(client, project_id, location, output_gcs_uri, ssml_text)

                if download_link is None:
                    return jsonify({'error': 'Erro ao processar a síntese. Verifique os logs para mais detalhes.'}), 500

                record = {
                    'id': next_record_id,
                    'file_name': output_file_name,
                    'timestamp': datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
                    'status': 'Concluído',
                    'download_link': download_link
                }
                history_tts.append(record)
                next_record_id += 1

                return jsonify({
                    'success': True,
                    'message': 'Síntese concluída com sucesso!',
                    'download_link': download_link,
                    'record': record
                })

            except Exception as e:
                logger.error(f"Erro ao processar síntese: {str(e)}")
                return jsonify({'error': f'Erro ao processar síntese: {str(e)}'}), 500

    return render_template('index_tts.html', history=history_tts)

@app.route('/index_stt.html', methods=['GET', 'POST'])
def index_stt():
    global next_record_id
    if request.method == 'POST':
        try:
            audio_uri = request.form.get('audio_uri')
            if not audio_uri:
                return jsonify({'error': 'URI do áudio não fornecida'}), 400

            if not audio_uri.startswith('gs://'):
                return jsonify({'error': 'URI inválida. A URI deve começar com "gs://"'}), 400

            client = create_stt_client()
            transcripts = transcribe_audio(client, audio_uri)

            if not transcripts:
                return jsonify({'error': 'Erro na transcrição. Verifique os logs para mais detalhes.'}), 500

            # Formata o texto automaticamente
            formatted_text = format_transcribed_text(transcripts[0])
            
            # Adiciona ao histórico
            record = {
                'id': next_record_id,
                'file_name': audio_uri.split('/')[-1],
                'timestamp': datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
                'status': 'Concluído'
            }
            history_stt.append(record)
            next_record_id += 1
            
            return jsonify({
                'success': True,
                'message': 'Transcrição concluída com sucesso!',
                'transcripts': formatted_text,
                'record': record
            })

        except Exception as e:
            logger.error(f"Erro ao processar transcrição: {str(e)}")
            return jsonify({'error': f'Erro ao processar transcrição: {str(e)}'}), 500

    return render_template('index_stt.html', history=history_stt)

@app.route('/')
def index():
    return render_template('home.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/delete_record/<int:record_id>', methods=['POST'])
def delete_record(record_id):
    try:
        # Encontra o registro no histórico
        history_tts[:] = [record for record in history_tts if record.get('id') != record_id]
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/clear_history', methods=['POST'])
def clear_history():
    try:
        data = request.get_json()
        if not data or 'record_ids' not in data:
            return jsonify({'error': 'IDs dos registros não fornecidos'}), 400

        record_ids = data['record_ids']
        if not isinstance(record_ids, list):
            return jsonify({'error': 'Lista de IDs inválida'}), 400

        # Remove os registros selecionados
        history_stt[:] = [record for record in history_stt if record.get('id') not in record_ids]
        
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Erro ao limpar histórico: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/chat')
def chat():
    """Renderiza a página do chat."""
    return render_template('chat.html')

@app.route('/chat/send', methods=['POST'])
def chat_send():
    """Processa uma mensagem do chat."""
    try:
        # Obtém os dados do FormData
        message = request.form.get('message', '')
        temperature = float(request.form.get('temperature', 0.7))
        
        # Processa a imagem se existir
        image_path = None
        if 'image' in request.files:
            image = request.files['image']
            if image and image.filename:
                # Cria diretório para uploads se não existir
                upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
                if not os.path.exists(upload_dir):
                    os.makedirs(upload_dir)
                
                # Salva a imagem
                image_path = os.path.join(upload_dir, image.filename)
                image.save(image_path)

        # Inicializa o cliente do chat
        api_key = chat_module.create_chat_client()
        if not api_key:
            if image_path and os.path.exists(image_path):
                os.remove(image_path)
            return jsonify({'error': 'Erro ao criar cliente do chat'}), 500

        try:
            # Envia a mensagem
            response = chat_module.send_chat_message(api_key, message, image_path, temperature)
            
            # Remove a imagem após o uso
            if image_path and os.path.exists(image_path):
                os.remove(image_path)
            
            return jsonify({'response': response})
        except Exception as e:
            # Garante que a imagem seja removida em caso de erro
            if image_path and os.path.exists(image_path):
                os.remove(image_path)
            raise e
            
    except Exception as e:
        logger.error(f"Erro no processamento do chat: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/format_text', methods=['POST'])
def format_text():
    """Formata o texto usando o Gemini."""
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({'error': 'Texto não fornecido'}), 400

        text = data['text']
        
        # Cria o prompt para formatação
        prompt = """
        Por favor, corrija a pontuação e a ortografia do seguinte texto, seguindo as normas da Língua Portuguesa do Brasil,
        mantendo o estilo, a formatação original e sem parafrasear:

        {}
        """.format(text)

        # Inicializa o cliente do chat
        api_key = chat_module.create_chat_client()
        if not api_key:
            return jsonify({'error': 'Erro ao criar cliente do chat'}), 500

        # Envia a mensagem para formatação
        response = chat_module.send_chat_message(api_key, prompt)
        
        return jsonify({'formatted_text': response})
    except Exception as e:
        logger.error(f"Erro na formatação do texto: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)