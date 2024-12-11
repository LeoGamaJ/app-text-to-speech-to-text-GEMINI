import os
import logging
import xml.etree.ElementTree as ET
from google.cloud import texttospeech
from google.api_core.exceptions import GoogleAPICallError, RetryError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Cria um manipulador para registrar em um arquivo
file_handler = logging.FileHandler('tts_synthesis.log')
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Cria um manipulador para exibir no console
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
logger.addHandler(console_handler)

# Configure o caminho para seu arquivo de credenciais JSON
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '/home/assum/Documentos/GEMINI_TEXT_TO_SPEECH/credentials.json')

def create_tts_client():
    """Cria e retorna um cliente TTS."""
    return texttospeech.TextToSpeechLongAudioSynthesizeClient()

def prepare_audio_config():
    """Prepara a configuração de áudio."""
    return texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.LINEAR16)

def prepare_voice_params():
    """Prepara os parâmetros de voz."""
    return texttospeech.VoiceSelectionParams(
        language_code="pt-BR",
        name="pt-BR-Wavenet-B"  # A voz para português
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

def read_ssml_from_file(file_path):
    """Lê o SSML de um arquivo."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            ssml = file.read()
        logger.info(f"Successfully read SSML from {file_path}.")
        return ssml
    except Exception as e:
        logger.error(f"Failed to read SSML from file: {e}")
        return None

def synthesize_long_audio(client, project_id, location, output_gcs_uri, ssml):
    """Sintetiza áudio longo, escrevendo o resultado no GCS."""
    if not validate_ssml(ssml):
        logger.error("SSML validation failed. Aborting synthesis.")
        return

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
        # Inicia a operação de síntese
        operation = client.synthesize_long_audio(request=request)
        # Define um prazo para a operação longa terminar.
        result = operation.result(timeout=300)
        logger.info("Finished processing, check your GCS bucket to find your audio file!")
    except (GoogleAPICallError, RetryError) as e:
        logger.error(f"Failed to synthesize audio: {e}")
