# Pixoo 64 schedule (HA-managed)

Home Assistant owns face rotation and brightness. The Divoom app schedule is not used.

## Entities

| Role | Entity |
|------|--------|
| Override dropdown | `input_select.pixoo_face` |
| What schedule wants | `sensor.pixoo_scheduled_face` |
| What is showing (schedule or override) | `sensor.pixoo_active_face` |
| Night/day brightness target | `sensor.pixoo_scheduled_brightness` |
| Apply script | `script.pixoo_apply_face` |
| Pixoo page target | `sensor.nourez_s_bedroom_nourez_s_bedroom_pixoo_64_current_page` |
| Pixoo brightness | `light.nourez_s_bedroom_nourez_s_bedroom_pixoo_64_light` |

Package on the HA PVC: `/config/packages/pixoo_schedule.yaml`

## Clock rotation

### Mon–Fri

| Window | Face |
|--------|------|
| 06:00–09:00 | Valoub Clock |
| 09:00–17:00 | Mondrian Pixel Art |
| 17:00–23:00 | Cloud Channel |
| 23:00–06:00 | Big Time |

### Sat–Sun

| Window | Face |
|--------|------|
| 06:00–09:00 | Valoub Clock |
| 09:00–17:00 | Plan 1 |
| 17:00–23:00 | Cloud Channel |
| 23:00–06:00 | Big Time |

## Brightness

| Window | Brightness |
|--------|------------|
| 23:00–06:00 | 1% |
| 06:00–23:00 | 100% |

## Clock IDs

From [CLOCKS.md](https://github.com/gickowtf/pixoo-homeassistant/blob/main/READMES/CLOCKS.md):

| Face | ID |
|------|----|
| Valoub Clock | 146 |
| Mondrian Pixel Art | 108 |
| Cloud Channel | 57 |
| Big Time | 152 |
| Plan 1 | 201 |
| Weather One | 182 |
| Weather Two | 172 |
| Custom 1 | 61 |
| Custom 2 | 63 |
| Custom 3 | 65 |
| Visualizer | 59 |

## Automations tied to other devices

| Trigger | Action |
|---------|--------|
| `binary_sensor.bedroom_turntable` → on | Face / override → Visualizer |
| `binary_sensor.bedroom_turntable` → off for 1 minute | Face / override → Schedule |

## Override model

`input_select.pixoo_face` is the control plane:

1. Leave on **Schedule** for automatic weekday/time rotation.
2. Pick any face to override; schedule boundaries will not clear it.
3. Set back to **Schedule** (UI or automation) to resume rotation.

Future automations should use `input_select.select_option` on `input_select.pixoo_face` so the dropdown and `sensor.pixoo_active_face` stay in sync.

Example:

```yaml
action: input_select.select_option
target:
  entity_id: input_select.pixoo_face
data:
  option: Visualizer
```

Resume:

```yaml
action: input_select.select_option
target:
  entity_id: input_select.pixoo_face
data:
  option: Schedule
```

## Dashboard (Nourez's Bedroom Overview)

The auto Overview area view cannot take custom Lovelace YAML. Face controls are assigned to the **bedroom** area (and Pixoo device) so they appear on **Nourez's Bedroom** under **Others**:

- Current face (`sensor.pixoo_active_face`) — currently e.g. Valoub Clock
- Face / override (`input_select.pixoo_face`) — set to Schedule or a specific face
- Scheduled face (`sensor.pixoo_scheduled_face`)

`Current Page` from the integration is hidden (unused page index). Brightness remains on **Pixoo 64 Light** in the Lights section (safe to remove from that card once you use schedule brightness).

Optional entities card for a custom dashboard:

```yaml
type: entities
title: Bedroom Pixoo 64
show_header_toggle: false
entities:
  - entity: sensor.pixoo_active_face
    name: Current face
  - entity: input_select.pixoo_face
    name: Face / override
  - entity: sensor.pixoo_scheduled_face
    name: Scheduled face
  - entity: light.nourez_s_bedroom_nourez_s_bedroom_pixoo_64_light
    name: Brightness
```

## Notes

- Integration `pages_data` must stay empty so demo page rotation does not fight this schedule.
- Cloud Channel content is still curated in the Divoom app; HA only selects that channel face.
