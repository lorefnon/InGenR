We're really glad you're reading this, because we need volunteer developers to help this project come to fruition. 👏

Like all projects InGenR can have bugs and can benefit from enhancements.

## Goals

InGenR is built around following goals:

- **Minimal Core:** The core is extremely small and supports only code generation support. Any integrations for specific frameworks, libraries, etc. should be implemented in "userland" packages.
- **Extensible:** While InGenR is happy to exist as a standalone CLI utility, it should also be easy to plug it in as a part of an automated pipeline, so all features must be exposed through an easy to use public API.
- **Forever Backward Compatible:** Upgrades should be trivial. Existing templates should never break.

## Instructions

These steps will guide you through contributing to this project:

- Fork the repo
- Clone it and install dependencies

        git clone https://github.com/lorefnon/ingenr
        npm install

Make and commit your changes. Make sure the commands npm run build and npm run test:prod are working.

Finally send a [GitHub Pull Request](https://github.com/alexjoverm/typescript-library-starter/compare?expand=1) with a clear list of what you've done (read more [about pull requests](https://help.github.com/articles/about-pull-requests/)). Make sure all of your commits are atomic (one feature per commit).
