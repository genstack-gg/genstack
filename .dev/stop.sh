#!env bash

SESSION="Genstack"

SESSIONEXISTS=$(tmux list-sessions | grep $SESSION)

if [ "$SESSIONEXISTS" = "" ]
then
  tmux kill-session -t $SESSION
fi
