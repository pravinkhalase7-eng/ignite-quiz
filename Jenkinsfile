pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Build PWA') {
            steps {
                dir('web') {
                    sh '''
                        if ! command -v node >/dev/null 2>&1; then
                            echo "Node.js is not installed on this Jenkins agent."
                            exit 1
                        fi
                        node -v
                        npm ci
                        npm run build
                    '''
                }
            }
        }
    }

    post {
        success {
            archiveArtifacts artifacts: 'web/dist/**/*', fingerprint: true
        }
    }
}
