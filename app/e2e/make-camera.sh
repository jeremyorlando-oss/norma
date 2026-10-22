#!/bin/sh
# Fausse caméra pour les tests (étiquette + code-barres), ~20 Mo : non versionnée
ffmpeg -loglevel error -y -loop 1 -i "$(dirname "$0")/fixtures/camera.png" -t 3 -r 5 -pix_fmt yuv420p "$(dirname "$0")/fixtures/camera.y4m"
