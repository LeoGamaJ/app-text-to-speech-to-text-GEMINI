$(document).ready(function() {
    // Funções comuns
    function showNotification(message, type = 'success') {
        const notification = $('#notification');
        notification.removeClass().addClass(`alert alert-${type}`).text(message).show();
        setTimeout(() => notification.fadeOut(), 3000);
    }

    // Função para ajustar altura do textarea
    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
    }

    // Funções específicas para STT
    function createDownloadLinks(text) {
        const blobTxt = new Blob([text], { type: "text/plain;charset=utf-8" });
        const blobMd = new Blob([text], { type: "text/markdown;charset=utf-8" });

        document.getElementById('downloadTxt').href = URL.createObjectURL(blobTxt);
        document.getElementById('downloadMd').href = URL.createObjectURL(blobMd);

        document.getElementById('downloadTxt').download = 'transcricao.txt';
        document.getElementById('downloadMd').download = 'transcricao.md';
    }

    function transcreverAudio() {
        const audioUri = document.getElementById('audio_uri').value;
        if (!audioUri) {
            showNotification('Por favor, insira a URI do arquivo de áudio.', 'danger');
            return;
        }

        // Mostrar modal de carregamento
        $('#loadingModal').modal('show');

        fetch('/index_stt.html', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'audio_uri': audioUri
            })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Erro ao transcrever o áudio');
                });
            }
            return response.json();
        })
        .then(data => {
            $('#loadingModal').modal('hide');
            
            if (data.success) {
                showNotification(data.message);
                
                // Mostrar o texto transcrito
                const textarea = document.getElementById('transcriptionsText');
                textarea.value = data.transcripts;
                document.getElementById('transcriptionContainer').style.display = 'block';
                
                // Ajustar altura do textarea
                autoResizeTextarea(textarea);
                
                // Criar links de download
                createDownloadLinks(data.transcripts);
                
                // Atualizar histórico
                const newRecord = `
                    <li id="record-${data.record.id}" class="list-group-item d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <div class="form-check me-3">
                                <input class="form-check-input record-checkbox" type="checkbox" value="${data.record.id}" id="checkbox-${data.record.id}">
                            </div>
                            <i class="fas fa-history text-primary me-2"></i>
                            <span class="fw-medium">${data.record.file_name}</span>
                        </div>
                        <div class="d-flex align-items-center">
                            <div class="text-muted">
                                <small>${data.record.timestamp}</small>
                                <span class="badge bg-primary ms-2">${data.record.status}</span>
                            </div>
                        </div>
                    </li>
                `;
                $('#historyList').prepend(newRecord);
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            $('#loadingModal').modal('hide');
            showNotification(error.message || 'Erro ao transcrever o áudio.', 'danger');
        });
    }

    // Funções específicas para TTS
    function iniciarSintese(formData) {
        // Mostrar modal de carregamento
        $('#loadingModal').modal('show');

        fetch('/index_tts.html', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Erro ao processar a síntese');
                });
            }
            return response.json();
        })
        .then(data => {
            $('#loadingModal').modal('hide');
            
            if (data.success) {
                showNotification(data.message);
                
                // Atualizar histórico
                const newRecord = `
                    <li id="record-${data.record.id}" class="list-group-item d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <div class="form-check me-3">
                                <input class="form-check-input record-checkbox" type="checkbox" value="${data.record.id}" id="checkbox-${data.record.id}">
                            </div>
                            <i class="fas fa-history text-primary me-2"></i>
                            <span class="fw-medium">${data.record.file_name}</span>
                        </div>
                        <div class="d-flex align-items-center">
                            <div class="text-muted">
                                <small>${data.record.timestamp}</small>
                                <span class="badge bg-primary ms-2">${data.record.status}</span>
                            </div>
                        </div>
                    </li>
                `;
                $('#historyList').prepend(newRecord);
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            $('#loadingModal').modal('hide');
            showNotification(error.message || 'Erro ao processar a síntese.', 'danger');
        });
    }

    // Event Listeners
    // Auto-resize do textarea quando o conteúdo muda
    $("#transcriptionsText").on('input', function() {
        autoResizeTextarea(this);
    });

    // STT Form
    $("#sttForm").submit(function(event) {
        event.preventDefault();
        transcreverAudio();
    });

    // TTS Form
    $("#ttsForm").submit(function(event) {
        event.preventDefault();
        const formData = new FormData(this);
        iniciarSintese(formData);
    });

    // Botão de limpar transcrição
    $(".delete-transcription").click(function() {
        $('#transcriptionsText').val('');
        $('#transcriptionContainer').hide();
    });

    // Botão de excluir registros selecionados
    $("#clearHistory").click(function() {
        const selectedIds = $('.record-checkbox:checked').map(function() {
            return $(this).val();
        }).get();

        if (selectedIds.length === 0) {
            showNotification('Selecione pelo menos um registro para excluir.', 'warning');
            return;
        }

        fetch('/clear_history', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ record_ids: selectedIds })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Corrigido: Remover cada elemento li que contém o checkbox selecionado
                selectedIds.forEach(id => {
                    $(`#checkbox-${id}`).closest('li').fadeOut(function() {
                        $(this).remove();
                    });
                });
                showNotification('Registros selecionados excluídos com sucesso!');
            } else {
                showNotification('Erro ao excluir registros.', 'danger');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification('Erro ao excluir registros.', 'danger');
        });
    });

    // Botão de excluir registro do histórico
    $(document).on('click', '.delete-record', function() {
        const recordId = $(this).data('record-id');
        fetch(`/delete_record/${recordId}`, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    $(`#record-${recordId}`).fadeOut(() => $(this).remove());
                    showNotification('Registro excluído com sucesso!');
                } else {
                    showNotification('Erro ao excluir registro.', 'danger');
                }
            })
            .catch(error => {
                console.error('Erro:', error);
                showNotification('Erro ao excluir registro.', 'danger');
            });
    });
});