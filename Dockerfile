# Imagem base oficial do Node.js LTS leve (Alpine)
FROM node:20-alpine

# Diretório da aplicação no container
WORKDIR /app

# Copia manifestos de dependências
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm ci --only=production

# Copia o código fonte e assets públicos
COPY . .

# Expõe a porta padrão
EXPOSE 3000

# Variáveis padrão
ENV NODE_ENV=production
ENV PORT=3000

# Inicializa o servidor
CMD ["node", "src/server.js"]
