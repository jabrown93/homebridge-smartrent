# Preserve Accessories on Discovery Failure

## Problem

`SmartRentApi.discoverDevices()` currently returns `[]` when configured unit is missing or selected unit has no hub. `SmartRentPlatform.discoverDevices()` treats that value as successful empty inventory and unregisters every cached accessory.

## Design

Return `undefined` for discovery attempts aborted before hub inventory retrieval. In `SmartRentPlatform.discoverDevices()`, return immediately when result is `undefined`.

Keep `[]` for successful hub inventory containing no devices. This preserves existing stale-accessory cleanup when SmartRent authoritatively reports empty inventory.

## Verification

- API unit tests expect `undefined` for missing unit and missing hub.
- Platform regression test configures cached accessory, returns `undefined`, and proves no accessory is unregistered.
- Existing successful-empty-inventory test continues proving stale accessory cleanup.

## Scope

Local fork only. No upstream contact, dependency changes, version bump, or unrelated refactor.
