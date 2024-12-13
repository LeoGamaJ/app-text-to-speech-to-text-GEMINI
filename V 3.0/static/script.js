// Funções globais para exportação e limpeza do chat
function formatChatHistory(format) {
    const messages = document.querySelectorAll('.message');
    let content = '';
    const timestamp = new Date().toLocaleString();

    if (format === 'md') {
        content = `# Histórico do Chat\n\n_Exportado em: ${timestamp}_\n\n`;
        messages.forEach(msg => {
            const isUser = msg.classList.contains('message-user');
            const text = msg.textContent.trim();
            content += `### ${isUser ? '👤 Usuário' : '🤖 IA'}\n${text}\n\n`;
        });
    } else {
        content = `Histórico do Chat\n\nExportado em: ${timestamp}\n\n`;
        messages.forEach(msg => {
            const isUser = msg.classList.contains('message-user');
            const text = msg.textContent.trim();
            content += `${isUser ? 'Usuário' : 'IA'}: ${text}\n\n`;
        });
    }

    return content;
}

function exportChat(format) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages || chatMessages.children.length === 0) {
        showNotification('Não há mensagens para exportar!', 'warning');
        return;
    }

    const content = formatChatHistory(format);
    const blob = new Blob([content], { 
        type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' 
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_export_${new Date().toISOString().slice(0,10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('Chat exportado com sucesso!', 'success');
}

function clearChat() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages || chatMessages.children.length === 0) {
        showNotification('O chat já está vazio!', 'warning');
        return;
    }

    if (confirm('Tem certeza que deseja limpar o histórico do chat?')) {
        chatMessages.innerHTML = '';
        window.chatState.messages = [];
        showNotification('Chat limpo com sucesso!', 'success');
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.className = `alert alert-${type}`;
        notification.style.display = 'block';
        notification.textContent = message;
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Inicialização do chat
window.chatState = {
    messages: [],
    currentModel: 'gemini-1.5-pro',
    temperature: 0.7,
    imageMode: false
};

$(document).ready(function() {
    // Funções comuns
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

    // Funções específicas para Chat
    function initializeChat() {
        // Event listeners para configurações
        $('#modelSelect').on('change', function() {
            window.chatState.currentModel = $(this).val();
        });

        $('#temperatureRange').on('input', function() {
            const value = $(this).val();
            $('#temperatureValue').text(value);
            window.chatState.temperature = parseFloat(value);
        });

        $('#imageMode').on('change', function() {
            window.chatState.imageMode = $(this).is(':checked');
            $('#imageUploadArea').toggle(window.chatState.imageMode);
            if (!window.chatState.imageMode) {
                clearImageUpload();
            }
        });

        // Event listener para upload de imagem
        $('#imageInput').on('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    $('#imagePreview').html(`<img src="${e.target.result}" alt="Preview">`);
                };
                reader.readAsDataURL(file);
            }
        });

        // Event listener para remover imagem
        $('#removeImage').on('click', clearImageUpload);

        // Event listener para envio de mensagem
        $('#messageInput').on('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        $('#sendMessage').on('click', sendMessage);

        // Auto-resize do textarea
        $('#messageInput').on('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }

    function clearImageUpload() {
        $('#imageInput').val('');
        $('#imagePreview').empty();
    }

    function addMessage(content, isUser = true) {
        const message = {
            content: content,
            timestamp: new Date(),
            isUser: isUser
        };

        window.chatState.messages.push(message);
        renderMessage(message);
        scrollToBottom();
    }

    function renderMessage(message) {
        const time = message.timestamp.toLocaleTimeString();
        const messageHtml = `
            <div class="message ${message.isUser ? 'message-user' : 'message-ai'}">
                ${message.content}
                <div class="message-time">${time}</div>
            </div>
        `;
        $('#chatMessages').append(messageHtml);
    }

    function showTypingIndicator() {
        const indicator = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        $('#chatMessages').append(indicator);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        $('.typing-indicator').remove();
    }

    function scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendMessage() {
        if (window.chatState.isProcessing) return;

        const messageInput = $('#messageInput');
        const message = messageInput.val().trim();
        const imageInput = document.getElementById('imageInput');
        const imageFile = imageInput.files[0];

        if (!message && !imageFile) return;

        window.chatState.isProcessing = true;
        messageInput.prop('disabled', true);
        $('#sendMessage').prop('disabled', true);

        // Adiciona a mensagem do usuário
        addMessage(message);
        messageInput.val('');
        messageInput.css('height', 'auto');

        // Prepara os dados para envio
        const formData = new FormData();
        formData.append('message', message);
        formData.append('temperature', window.chatState.temperature);
        formData.append('model', window.chatState.currentModel);
        
        if (imageFile) {
            formData.append('image', imageFile);
        }

        // Mostra indicador de digitação
        showTypingIndicator();

        try {
            const response = await fetch('/chat/send', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Erro na requisição');

            const data = await response.json();
            removeTypingIndicator();
            addMessage(data.response, false);

            if (imageFile) {
                clearImageUpload();
            }
        } catch (error) {
            removeTypingIndicator();
            showNotification('Erro ao enviar mensagem: ' + error.message, 'danger');
        } finally {
            window.chatState.isProcessing = false;
            messageInput.prop('disabled', false);
            $('#sendMessage').prop('disabled', false);
            messageInput.focus();
        }
    }

    // Event Listeners
    document.addEventListener('DOMContentLoaded', function() {
        if (window.location.pathname === '/chat') {
            // Botões de exportação e limpeza
            $('#exportTxt').on('click', () => exportChat('txt'));
            $('#exportMd').on('click', () => exportChat('md'));
            $('#clearChat').on('click', clearChat);

            // Controle de temperatura
            $('#temperatureRange').on('input', function() {
                const value = $(this).val();
                $('#temperatureValue').text(value);
                window.chatState.temperature = parseFloat(value);
            });

            // Modo imagem
            $('#imageMode').on('change', function() {
                window.chatState.imageMode = this.checked;
                $('#imageUploadArea').toggle(this.checked);
            });
        }
    });

    // Inicializa o chat quando estiver na página correta
    if (window.location.pathname === '/chat') {
        $(document).ready(initializeChat);
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