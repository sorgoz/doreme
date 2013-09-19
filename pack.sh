#!/bin/bash

# use tar to create a clean directory
tar -cf - --exclude=.git \
        --exclude=.gitignore \
        --exclude=.svn \
		-s /extension/gallery/ ./extension | tar -x

if [ $? -ne 0 ]; then
	echo "$0: tar failed"
	exit 1
fi

rm -f doreme.zip

# create a zip of the contents

cd gallery && \
	zip -r -0 ../doreme.zip . && \
	cd .. && \
	rm -rf gallery
