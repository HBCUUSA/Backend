# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy all source files including .env
COPY . .

# Optional: set environment variables from .env manually
# (Node apps usually use dotenv package to load it automatically)

# Expose app port
EXPOSE 8000

# Start the server
CMD ["node", "server.js"]
