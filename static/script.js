$(document).ready(function() {
    // Função para criar os links de download
    function createDownloadLinks(text) {
        var blobTxt = new Blob([text], { type: "text/plain;charset=utf-8" });
        var blobMd = new Blob([text], { type: "text/markdown;charset=utf-8" });

        var urlTxt = window.URL.createObjectURL(blobTxt);
        var urlMd = window.URL.createObjectURL(blobMd);

        $("#downloadTxt").attr("href", urlTxt);
        $("#downloadMd").attr("href", urlMd);
    }

    // Manipulador de evento para o formulário STT
    $("#sttForm").submit(function(event) {
        event.preventDefault();
        
        // Desabilita o botão de submit para evitar envios múltiplos
        $("#sttForm button[type='submit']").prop("disabled", true); 

        // Exibe a barra de progresso
        $("#progressBarContainer").show();
        $("#progressBar").width("0%");

        // Obtém a URI do áudio do formulário
        var audioUri = $("#audio_uri").val();

        // Faz a requisição AJAX para a rota /transcribe
        $.ajax({
            url: '/index_stt.html',
            type: 'POST',
            data: { audio_uri: audioUri },
            success: function(response) {
                // Processa a resposta do servidor
                $("#transcriptionsText").val(response.transcripts);
                createDownloadLinks(response.transcripts);

                // Exibe a área de transcrição e a notificação
                $("#transcriptionContainer").show();
                $("#notification").text("A transcrição foi realizada com sucesso!");
                $("#notification").removeClass("hidden");
            },
            error: function() {
                $("#notification").text("Erro ao realizar a transcrição.");
                $("#notification").removeClass("hidden");
            },
            complete: function() {
                // Esconde a barra de progresso e reabilita o botão de submit
                $("#progressBarContainer").hide();
                $("#sttForm button[type='submit']").prop("disabled", false);
            }
        });
    });
});