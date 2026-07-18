FROM node:20

WORKDIR /usr/src/app
COPY package.json ./

RUN npm install && npm install -g qrcode-terminal pm2
COPY . .

# EXPOSE ain karala kelinma start karanna
CMD ["npm", "start"]
