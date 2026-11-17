$git = "C:\Users\Gabriel Serpa\.gemini\antigravity\scratch\bin\mingit\cmd\git.exe"
Set-Location -Path "C:\Users\Gabriel Serpa\.gemini\antigravity\scratch\b2-trello-whatsapp-automation"

& $git init
& $git config user.name "B2 Energia Solar"
& $git config user.email "comercial@b2energiasolar.com.br"
& $git add .
& $git commit -m "Initial commit: B2 Energia Solar Trello WhatsApp Automation System"
& $git status
