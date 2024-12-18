// Funções globais para exportação e limpeza do chat
function formatChatHistory(format) {
    const messages = document.querySelectorAll('.message');
    let content = '';
    const timestamp = new Date().toLocaleString();

    if (format === 'md') {
        content = `# Histórico do Chat\n\n_Exportado em: ${timestamp}_\n\n`;
        messages.forEach(msg => {
            const isUser = msg.classList.contains('message-user');
            const text = msg.querySelector('.message-content').textContent.trim();
            content += `### ${isUser ? '👤 Usuário' : '🤖 IA'}\n${text}\n\n`;
        });
    } else {
        content = `Histórico do Chat\n\nExportado em: ${timestamp}\n\n`;
        messages.forEach(msg => {
            const isUser = msg.classList.contains('message-user');
            const text = msg.querySelector('.message-content').textContent.trim();
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
    topK: 40,
    topP: 0.95,
    maxTokens: 2048,
    imageMode: false,
    isProcessing: false
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
            const value = $(this).val();
            window.chatState.currentModel = value;
            console.log('Modelo alterado para:', value);
        });

        $('#temperatureRange').on('input', function() {
            const value = $(this).val();
            $('#temperatureValue').text(value);
            window.chatState.temperature = parseFloat(value);
            console.log('Temperatura alterada para:', value);
        });

        $('#topKRange').on('input', function() {
            const value = $(this).val();
            $('#topKValue').text(value);
            window.chatState.topK = parseInt(value);
            console.log('Top K alterado para:', value);
        });

        $('#topPRange').on('input', function() {
            const value = $(this).val();
            $('#topPValue').text(value);
            window.chatState.topP = parseFloat(value);
            console.log('Top P alterado para:', value);
        });

        $('#maxTokensRange').on('input', function() {
            const value = $(this).val();
            $('#maxTokensValue').text(value);
            window.chatState.maxTokens = parseInt(value);
            console.log('Max Tokens alterado para:', value);
        });

        $('#imageMode').on('change', function() {
            window.chatState.imageMode = $(this).prop('checked');
            $('#imageUploadArea').toggle(window.chatState.imageMode);
            if (!window.chatState.imageMode) {
                clearImageUpload();
            }
        });

        // Event listener para upload de imagem
        $('#imageInput').on('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    $('#previewImg').attr('src', e.target.result);
                    $('#imagePreview').show();
                };
                reader.readAsDataURL(file);
            } else {
                clearImageUpload();
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
        $('#imagePreview').hide();
        $('#previewImg').attr('src', '');
    }

    function formatCodeInMessage(message) {
        // Detecta blocos de código com ou sem especificação de linguagem
        const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
        const inlineCodeRegex = /`([^`]+)`/g;

        // Função para formatar o código Python
        function formatPythonCode(code) {
            // Remove espaços em branco extras no início e fim
            code = code.trim();
            
            // Divide o código em linhas
            let lines = code.split('\n');
            
            // Remove linhas vazias no início e fim
            while (lines.length > 0 && lines[0].trim() === '') lines.shift();
            while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
            
            // Detecta o nível de indentação base
            const baseIndent = lines.reduce((min, line) => {
                if (line.trim() === '') return min;
                const indent = line.match(/^\s*/)[0].length;
                return Math.min(min, indent);
            }, Infinity);
            
            // Remove a indentação base de todas as linhas
            lines = lines.map(line => line.slice(baseIndent));
            
            return lines.join('\n');
        }

        // Substitui blocos de código
        message = message.replace(codeBlockRegex, (match, language, code) => {
            language = language ? language.toLowerCase() : 'python';
            
            // Formata o código baseado na linguagem
            const formattedCode = language === 'python' ? formatPythonCode(code) : code.trim();
            
            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="language-tag">${language}</span>
                        <button class="copy-code" onclick="copyCode(this)">
                            <i class="fas fa-copy"></i> Copiar
                        </button>
                    </div>
                    <pre><code class="language-${language}">${escapeHtml(formattedCode)}</code></pre>
                </div>
            `;
        });

        // Substitui código inline
        message = message.replace(inlineCodeRegex, (match, code) => {
            return `<code class="inline-code">${escapeHtml(code.trim())}</code>`;
        });

        return message;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function copyCode(button) {
        const codeBlock = button.closest('.code-block').querySelector('code');
        const text = codeBlock.textContent;

        navigator.clipboard.writeText(text).then(() => {
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i> Copiado!';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('copied');
            }, 2000);
        });
    }

    function addMessage(content, isUser = true) {
        const messagesDiv = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'message-user' : 'message-ai'}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Formatar o conteúdo se for uma mensagem da IA
        if (!isUser) {
            contentDiv.innerHTML = formatCodeInMessage(content);
        } else {
            contentDiv.textContent = content;
        }
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();
        
        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);
        messagesDiv.appendChild(messageDiv);
        
        // Aplicar highlight.js se houver blocos de código
        if (!isUser) {
            messageDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
        
        scrollToBottom();
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

        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        const imageInput = document.getElementById('imageInput');
        const hasImage = window.chatState.imageMode && imageInput && imageInput.files[0];
        
        if (!message && !hasImage) {
            showNotification('Por favor, digite uma mensagem ou selecione uma imagem.', 'warning');
            return;
        }

        window.chatState.isProcessing = true;
        messageInput.disabled = true;
        $('#sendMessage').prop('disabled', true);

        // Adiciona a mensagem do usuário
        addMessage(message, true);
        if (hasImage) {
            // Adiciona preview da imagem na mensagem
            const imgPreview = $('<img>')
                .addClass('img-fluid rounded mt-2')
                .attr('src', $('#previewImg').attr('src'))
                .css('max-height', '200px');
            $('.message:last').append(imgPreview);
        }

        messageInput.value = '';
        autoResizeTextarea(messageInput);

        // Prepara o FormData com todos os parâmetros
        const formData = new FormData();
        formData.append('message', message);
        formData.append('model', window.chatState.currentModel);
        formData.append('temperature', window.chatState.temperature);
        formData.append('topK', window.chatState.topK);
        formData.append('topP', window.chatState.topP);
        formData.append('maxTokens', window.chatState.maxTokens);

        if (hasImage) {
            formData.append('image', imageInput.files[0]);
        }

        showTypingIndicator();

        try {
            const response = await fetch('/chat/send', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro na requisição');
            }

            if (data.error) {
                showNotification(data.error, 'error');
            } else if (data.response) {
                addMessage(data.response, false);
            }

        } catch (error) {
            console.error('Erro na requisição:', error);
            showNotification(error.message || 'Erro ao enviar mensagem', 'error');
        } finally {
            removeTypingIndicator();
            window.chatState.isProcessing = false;
            messageInput.disabled = false;
            $('#sendMessage').prop('disabled', false);
            scrollToBottom();
            if (hasImage) {
                clearImageUpload();
            }
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

    // Atualiza o manipulador de eventos do botão de envio
    document.getElementById('sendMessage').onclick = sendMessage;
    document.getElementById('messageInput').onkeypress = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
});