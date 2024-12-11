import os
import logging
from google.cloud import speech_v1p1beta1 as speech
from google.api_core.exceptions import GoogleAPICallError, RetryError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Cria um manipulador para registrar em um arquivo
file_handler = logging.FileHandler('stt_transcription.log')
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Cria um manipulador para exibir no console
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
logger.addHandler(console_handler)

# Configure o caminho para seu arquivo de credenciais JSON
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/caminho/para/seu/credential_stt_gcp.json'

def create_stt_client():
    """Cria e retorna um cliente STT."""
    return speech.SpeechClient()

def transcribe_audio(client, gcs_uri):
    """Transcreve o áudio fornecido em um URI do Google Cloud Storage."""
    audio = speech.RecognitionAudio(uri=gcs_uri)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.FLAC,
        sample_rate_hertz=44100,
        language_code="pt-BR",
        enable_word_time_offsets=True  # Habilitar offsets de tempo para cada palavra
    )

    try:
        logger.info(f"Iniciando a transcrição do áudio em: {gcs_uri}")
        response = client.long_running_recognize(config=config, audio=audio)
        logger.info("Transcrição iniciada, aguardando resultados...")
        result = response.result(timeout=300)  # Espera até 5 minutos para a operação ser concluída

        # Processar os resultados
        transcripts = []
        for result in result.results:
            transcripts.append(result.alternatives[0].transcript)

        logger.info("Transcrição concluída com sucesso!")
        return transcripts  # Retorna uma lista de transcrições
    except (GoogleAPICallError, RetryError) as e:
        logger.error(f"Erro ao transcrever áudio: {e}")
        return []  # Retorna uma lista vazia em caso de erro
