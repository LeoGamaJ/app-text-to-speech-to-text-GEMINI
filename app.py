import os
import logging
import xml.etree.ElementTree as ET
from google.cloud import texttospeech, speech_v1p1beta1 as speech
from google.api_core.exceptions import GoogleAPICallError, RetryError
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from datetime import datetime
import io
import requests
import json
from dotenv import load_dotenv

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
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/home/assum/Documentos/GEMINI_TEXT_TO_SPEECH/credentials.json'

# Inicializa o aplicativo Flask
app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Altere para uma chave secreta segura

# Listas para armazenar o histórico (separadas para TTS e STT)
history_tts = []
history_stt = []

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

def chamar_gemini(text):
    """Envia uma requisição para a API do Google Gemini e retorna a resposta pontuada."""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        return "Erro: GEMINI_API_KEY não encontrada no arquivo .env."

    url = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent"  
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key
    }

    # Prompt mais específico para pontuação e correção ortográfica, mantendo a originalidade do texto
    prompt = f"""
     Por favor, corrija a pontuação e a ortografia do seguinte texto, seguindo as normas da Língua Portuguesa do Brasil,
    mantendo o estilo, a formatação original e sem parafrasear:

    {text}
    """

    data = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}]
            }
        ]
    }

    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()

        resposta_json = response.json()
        # Extrai apenas o texto da resposta
        resposta_texto = resposta_json['candidates'][0]['content']['parts'][0]['text']  
        
        return resposta_texto

    except requests.exceptions.RequestException as e:
        return f"Erro na requisição à API do Gemini: {e}"


# Rotas do Flask
@app.route('/index_tts.html', methods=['GET', 'POST'])
def index_tts():
    global history_tts
    if request.method == 'POST':
        if 'ssml_file_path' not in request.files:
            flash('Nenhum arquivo selecionado.')
            return redirect(request.url)
        file = request.files['ssml_file_path']

        if file.filename == '':
            flash('Nenhum arquivo selecionado.')
            return redirect(request.url)

        if file:
            ssml_text = file.read().decode('utf-8')
            client = create_tts_client()

            project_id = os.getenv('PROJECT_ID', "pragmatic-aegis-436316-m4")  
            location = os.getenv('LOCATION', "us-east1")
            output_file_name = f"tts_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.wav"
            output_gcs_uri = f"gs://b_txt_speech/{output_file_name}"

            download_link = synthesize_long_audio(client, project_id, location, output_gcs_uri, ssml_text)

            history_tts.append({
                'file_name': output_file_name,
                'status': 'Concluído' if download_link is not None else 'Falhou',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })

            if download_link is None:
                flash("Erro ao processar a síntese. Verifique os logs para mais detalhes.")
            else:
                flash(f"Síntese concluída com sucesso! O arquivo pode ser encontrado em: {download_link}")

            return redirect(url_for('index_tts'))

    return render_template('index_tts.html', history=history_tts)

@app.route('/index_stt.html', methods=['GET', 'POST'])
def index_stt():
    global history_stt
    transcripts = []

    if request.method == 'POST':
        audio_uri = request.form['audio_uri']
        client = create_stt_client()
        transcripts = transcribe_audio(client, audio_uri)

        if transcripts:
            # Chama a API do Gemini para pontuar o texto
            transcripts[0] = chamar_gemini(transcripts[0])

            history_stt.append({
                'file_name': audio_uri,
                'status': 'Concluído',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })

            # Retorna a transcrição como JSON
            return jsonify({'transcripts': transcripts[0]}) 
        else:
            flash('Erro ao transcrever áudio. Verifique os logs para mais detalhes.')

    return render_template('index_stt.html', transcripts=transcripts, history=history_stt)  

@app.route('/', methods=['GET'])
def index():
    return render_template('home.html')

if __name__ == "__main__":
    app.run(debug=True)