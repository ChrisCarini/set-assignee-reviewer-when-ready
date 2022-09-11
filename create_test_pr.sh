#!/usr/bin/env bash

npm run build && npm run package

git add .
git commit --amend --no-edit

git push --force && git push origin --delete $USER/sampleChangeForDemo && git pull
git branch -D $USER/sampleChangeForDemo
git checkout -b $USER/sampleChangeForDemo
echo -e "\n\n\n\n\n\nSample 6 line addition For Demo" >>README.md
git add README.md && git commit --author="Carini Chris Test <6374067+chriscarini@users.noreply.github.com>" -m "Adding 6 empty lines to README.md" && git push -u origin $USER/sampleChangeForDemo
gh pr create \
  --base main \
  --title "Most amazing change to README.md" \
  --body "Adding 6 empty lines to README.md" \
  --head $USER/sampleChangeForDemo
git checkout main
