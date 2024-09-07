# Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## 1.0.0 (2024-09-07)


### Features

* **websockets,thermostat:** add SmartRent websocket driven accessory updates ([c710289](https://github.com/jabrown93/homebridge-smartrent/commit/c7102890ea132fcbab6fb4be3b287d0261902677))
* **switchmulilevel:** add Switch Multilevel ([517cf3e](https://github.com/jabrown93/homebridge-smartrent/commit/517cf3e0332b36286f7ca2e19e847b5fc07c3a42))
* **multi-level-switches:** added support ([0936473](https://github.com/jabrown93/homebridge-smartrent/commit/0936473d20a7b48f74866cc01cf5bb516ce32d84))
* initial commit ([5206863](https://github.com/jabrown93/homebridge-smartrent/commit/5206863e35c5297cf052de7388a029979b3a24ac))
* lint ([bd0c055](https://github.com/jabrown93/homebridge-smartrent/commit/bd0c05599b254dc54d3bc9345766fb0a6c348449))


### Bug Fixes

* **ci:** adding git plugin ([6886b09](https://github.com/jabrown93/homebridge-smartrent/commit/6886b091fe5d5eb988840248e4f7d8714274ff7d))
* cleaner, less error-prone logger ([149e4c2](https://github.com/jabrown93/homebridge-smartrent/commit/149e4c27654b6935b37342b41f5ebf0804d5cc7b))
* **thermostat:** correct handling of auto mode as per Homebridge spec ([b418ecb](https://github.com/jabrown93/homebridge-smartrent/commit/b418ecbed2c2d9a13c86ae9445ad4bc888c6e4c6))
* **ci:** downgrade semantic-release ([f8cbe51](https://github.com/jabrown93/homebridge-smartrent/commit/f8cbe5163b852d7c4a707fcd539483e8a2497a31))
* drop minimum Node version to 12 ([acaf3b2](https://github.com/jabrown93/homebridge-smartrent/commit/acaf3b2445a1b1a31c168186eaa385e4f53c8683))
* **ci:** fix .releaserc ([289ad44](https://github.com/jabrown93/homebridge-smartrent/commit/289ad44765b85b5d0f443a36f85b63a29448d804))
* **package-lock:** fixing package-lock.json ([65c998b](https://github.com/jabrown93/homebridge-smartrent/commit/65c998b00ec28189d2fcf8262d141d9a81d3d611))
* **ci:** lint ([bddfad7](https://github.com/jabrown93/homebridge-smartrent/commit/bddfad76c1f536deb1b32087ed6e7694176b3668))
* **ci:** remove git .releaserc ([85e11e9](https://github.com/jabrown93/homebridge-smartrent/commit/85e11e92a985df0cd897d761e8e4801e9b0f35a1))
* **thermostat:** reverting linter changes ([8af2da3](https://github.com/jabrown93/homebridge-smartrent/commit/8af2da384d7a794585f01a0b71ac2f408ca5fdfb))
* **ci:** run semantic release ([0aa769b](https://github.com/jabrown93/homebridge-smartrent/commit/0aa769bcf5b8aebd368903e3e8757ebf0b47f590))
* **license:** switch to GPLv3 ([2a1167e](https://github.com/jabrown93/homebridge-smartrent/commit/2a1167ed4a2c00fa665fb35fe65d15b2b7bd3125))
* use HOOBS-compatible characteristic handlers ([4cf8e4c](https://github.com/jabrown93/homebridge-smartrent/commit/4cf8e4cff8a9b877e5696db1ad03792a92445610))
* use Promise-based event listener registration ([#96](https://github.com/jabrown93/homebridge-smartrent/issues/96)) ([d23dbf7](https://github.com/jabrown93/homebridge-smartrent/commit/d23dbf7e276e82d49b11d2f62690f0ac26b33c7a)), closes [#4](https://github.com/jabrown93/homebridge-smartrent/issues/4) [#5](https://github.com/jabrown93/homebridge-smartrent/issues/5)
* use toTargetHeatingCoolingStateCharacteristic when setting the target mode ([384b334](https://github.com/jabrown93/homebridge-smartrent/commit/384b3343f96d735747ee64c598d16017d557f5cc))
* **ci:** using original .releaserc.json ([ecb1afc](https://github.com/jabrown93/homebridge-smartrent/commit/ecb1afccd11dcffd139af592a220cd3a678d2123))
* **ci:** version bump ([65d62cc](https://github.com/jabrown93/homebridge-smartrent/commit/65d62cc0d7c99d97b05d60eb866c48f3a32a6881))
* **ci:** version bump ([bb0694c](https://github.com/jabrown93/homebridge-smartrent/commit/bb0694c95fb69eb10f8bdbf9b09e1f2cfe5b2919))


### Reverts

* add back cooling_setpoint ([5de67b6](https://github.com/jabrown93/homebridge-smartrent/commit/5de67b66cfe34770cba401615311ca143422349a))

## [1.4.2](https://github.com/jabrown93/homebridge-smartrent/compare/v1.4.1...v1.4.2) (2023-09-06)


### Bug Fixes

* **license:** switch to GPLv3 ([2a1167e](https://github.com/jabrown93/homebridge-smartrent/commit/2a1167ed4a2c00fa665fb35fe65d15b2b7bd3125))

## [1.4.1](https://github.com/jabrown93/homebridge-smartrent/compare/v1.4.0...v1.4.1) (2023-09-06)


### Bug Fixes

* **package-lock:** fixing package-lock.json ([65c998b](https://github.com/jabrown93/homebridge-smartrent/commit/65c998b00ec28189d2fcf8262d141d9a81d3d611))

## [1.4.0](https://github.com/jabrown93/homebridge-smartrent/compare/v1.3.6...v1.4.0) (2023-07-28)


### Features

* **multi-level-switches:** added support ([0936473](https://github.com/jabrown93/homebridge-smartrent/commit/0936473d20a7b48f74866cc01cf5bb516ce32d84))

## [1.3.6](https://github.com/jabrown93/homebridge-smartrent/compare/v1.3.5...v1.3.6) (2023-07-28)


### Bug Fixes

* **ci:** adding git plugin ([6886b09](https://github.com/jabrown93/homebridge-smartrent/commit/6886b091fe5d5eb988840248e4f7d8714274ff7d))
* **ci:** downgrade semantic-release ([f8cbe51](https://github.com/jabrown93/homebridge-smartrent/commit/f8cbe5163b852d7c4a707fcd539483e8a2497a31))
* **ci:** run semantic release ([0aa769b](https://github.com/jabrown93/homebridge-smartrent/commit/0aa769bcf5b8aebd368903e3e8757ebf0b47f590))
* **ci:** using original .releaserc.json ([ecb1afc](https://github.com/jabrown93/homebridge-smartrent/commit/ecb1afccd11dcffd139af592a220cd3a678d2123))

## [1.3.0](https://github.com/jabrown93/homebridge-smartrent/compare/v1.2.0...v1.3.0) (2023-07-23)


### Features

* lint ([bd0c055](https://github.com/jabrown93/homebridge-smartrent/commit/bd0c05599b254dc54d3bc9345766fb0a6c348449))

## [1.0.3](https://github.com/jabrown93/homebridge-smartrent/compare/v1.0.2...v1.0.3) (2022-08-12)


### Bug Fixes

* use Promise-based event listener registration ([#96](https://github.com/jabrown93/homebridge-smartrent/issues/96)) ([d23dbf7](https://github.com/jabrown93/homebridge-smartrent/commit/d23dbf7e276e82d49b11d2f62690f0ac26b33c7a)), closes [#4](https://github.com/jabrown93/homebridge-smartrent/issues/4) [#5](https://github.com/jabrown93/homebridge-smartrent/issues/5)

### [1.0.2](https://github.com/jabrown93/homebridge-smartrent/compare/v1.0.1...v1.0.2) (2022-01-24)


### Bug Fixes

* cleaner, less error-prone logger ([149e4c2](https://github.com/jabrown93/homebridge-smartrent/commit/149e4c27654b6935b37342b41f5ebf0804d5cc7b))
* use HOOBS-compatible characteristic handlers ([4cf8e4c](https://github.com/jabrown93/homebridge-smartrent/commit/4cf8e4cff8a9b877e5696db1ad03792a92445610))

### [1.0.1](https://github.com/jabrown93/homebridge-smartrent/compare/v1.0.0...v1.0.1) (2022-01-24)


### Bug Fixes

* drop minimum Node version to 12 ([acaf3b2](https://github.com/jabrown93/homebridge-smartrent/commit/acaf3b2445a1b1a31c168186eaa385e4f53c8683))

## 1.0.0 (2022-01-24)


### Features

* initial commit ([5206863](https://github.com/jabrown93/homebridge-smartrent/commit/5206863e35c5297cf052de7388a029979b3a24ac))
