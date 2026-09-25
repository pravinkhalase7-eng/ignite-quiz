pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Build PWA') {
            steps {
                sh '''
                    docker version
                    docker build -t ignite-quiz:latest .
                    rm -rf web/dist
                    mkdir -p web/dist
                    cid=$(docker create ignite-quiz:latest)
                    docker cp "$cid":/app/dist/. web/dist/
                    docker rm "$cid"
                '''
            }
        }

        stage('Start app') {
            steps {
                sh '''
                    docker rm -f ignite-quiz || true
                    pgnet=$(docker inspect aiteacher-postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')
                    netarg=""
                    if [ -n "$pgnet" ]; then netarg="--network $pgnet"; fi
                    envarg=""
                    if [ -f /var/jenkins_home/ignite-quiz.env ]; then envarg="--env-file /var/jenkins_home/ignite-quiz.env"; fi
                    docker run -d --name ignite-quiz -p 4173:4173 $netarg $envarg -v ignite-quiz-data:/app/data --restart unless-stopped ignite-quiz:latest
                    docker ps --filter name=ignite-quiz
                    edge=$(docker ps --format '{{.ID}} {{.Ports}}' | awk '/:80->80/ {print $1; exit}')
                    if [ -z "$edge" ]; then
                      echo "No nginx container is publishing port 80"
                      exit 1
                    fi
                    docker exec "$edge" sh -c 'grep -q "server_name quiz.doxstation.com" /etc/nginx/conf.d/*.conf' \
                      || docker exec -i "$edge" sh -c 'cat > /etc/nginx/conf.d/60-quiz.conf' <<'EOF'
upstream ignite_quiz_app {
    server host.docker.internal:4173;
}
server {
    listen 80;
    listen [::]:80;
    server_name quiz.doxstation.com;
    client_max_body_size 20m;
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        proxy_pass http://ignite_quiz_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
EOF
                    docker exec "$edge" nginx -t
                    docker exec "$edge" nginx -s reload
                    echo "http://quiz.doxstation.com/ now proxies to port 4173"
                '''
            }
        }
    }

    post {
        success {
            archiveArtifacts artifacts: 'web/dist/**/*', fingerprint: true
        }
    }
}
