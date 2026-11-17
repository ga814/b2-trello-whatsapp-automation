$git = "C:\Users\Gabriel Serpa\.gemini\antigravity\scratch\bin\mingit\cmd\git.exe"
Set-Location -Path "C:\Users\Gabriel Serpa\.gemini\antigravity\scratch\b2-trello-whatsapp-automation"

& $git branch -M main
& $git remote remove origin -ErrorAction SilentlyContinue
& $git remote add origin https://github.com/ga814/b2-trello-whatsapp-automation.git
& $git remote -v
