# Stage 1: Build static React assets
FROM node:20-alpine AS build
WORKDIR /app

# Copy package descriptors
COPY package.json ./

# Install dependencies (generating lockfile dynamically in docker if not present)
RUN npm install

# Copy source assets
COPY . .

# Build Vite application (creates dist/ folder)
RUN npm run build

# Stage 2: Nginx Web Server
FROM nginx:alpine

# Copy built assets to default nginx public root
COPY --from=build /app/dist /usr/share/nginx/html

# Copy routing rules and proxy passes
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
