.PHONY: install run test test-all build e2e shots contrast layout

node_modules: package.json package-lock.json
	npm install
	touch node_modules

install: node_modules

run: node_modules
	npm run dev

test: node_modules
	npm test

test-all: node_modules
	npm run test:all

build: node_modules
	npm run build

e2e: build
	npm run e2e

shots: node_modules
	npm run shots

contrast: build
	npm run contrast

layout: build
	npm run layout
