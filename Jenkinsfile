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
                    docker run -d --name ignite-quiz -p 4173:4173 --restart unless-stopped ignite-quiz:latest
                    docker ps --filter name=ignite-quiz
                    echo "App is running on port 4173. Open http://<this-server>:4173"
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
