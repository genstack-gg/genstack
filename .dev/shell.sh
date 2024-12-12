#!env bash

# Session Name
SESSION="Genstack"
SESSIONEXISTS=$(tmux list-sessions | grep $SESSION)

if [ "$SESSIONEXISTS" = "" ]
then
  # Start New Session with our name
  tmux new-session -d -s $SESSION

  # Name first Window and start zsh
  tmux rename-window -t 0 'Main'
  tmux send-keys -t 'Main' 'zsh' C-m 'clear' C-m

  # Create and setup pane for hugo server
  tmux new-window -t $SESSION:1 -n 'Engine'
  tmux send-keys -t 'Engine' 'echo This would serve engine' C-m

  # Run bun server
  tmux new-window -t $SESSION:2 -n 'App'
  tmux send-keys -t 'App' "echo This would run the app" C-m
fi

# Attach Session, on the Main window
tmux attach-session -t $SESSION:0
