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
    }

    post {
        success {
            archiveArtifacts artifacts: 'web/dist/**/*', fingerprint: true
        }
    }
}
