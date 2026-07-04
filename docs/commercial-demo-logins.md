# Commercial demo logins

These accounts are provisioned by the Supabase Edge Function
`provision-commercial-demo-logins`.

Each login has three roles:

- `commercial`
- `client`
- `restaurateur`

The password/code is exactly the same text as the username.

| Username | Login email | Code/password | Demo restaurant |
| --- | --- | --- | --- |
| `commercial01` | `commercial01@demo.thetok.ch` | `commercial01` | Bistro Demo Jet |
| `commercial02` | `commercial02@demo.thetok.ch` | `commercial02` | Trattoria Demo Carouge |
| `commercial03` | `commercial03@demo.thetok.ch` | `commercial03` | Burger Demo Plainpalais |
| `commercial04` | `commercial04@demo.thetok.ch` | `commercial04` | Thai Demo Paquis |
| `commercial05` | `commercial05@demo.thetok.ch` | `commercial05` | Sushi Demo Eaux-Vives |
| `commercial06` | `commercial06@demo.thetok.ch` | `commercial06` | Grill Demo Nations |
| `commercial07` | `commercial07@demo.thetok.ch` | `commercial07` | Brunch Demo Jonction |
| `commercial08` | `commercial08@demo.thetok.ch` | `commercial08` | Mezze Demo Cornavin |
| `commercial09` | `commercial09@demo.thetok.ch` | `commercial09` | Pizzeria Demo Servette |
| `commercial10` | `commercial10@demo.thetok.ch` | `commercial10` | Cantine Demo Rive |

## Provisioning

Deploy the Edge Function, then run:

```bash
SUPABASE_URL="https://PROJECT_REF.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
pnpm commercial:demo-logins
```

To preview the credentials without creating or updating data:

```bash
SUPABASE_URL="https://PROJECT_REF.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
pnpm commercial:demo-logins -- --dry-run
```

The function is idempotent. Running it again resets the demo password/code,
keeps the three roles, and refreshes each demo restaurant with:

- restaurant profile details
- opening hours and service settings
- restaurant branch
- floor-plan tables
- menu items
- restaurant media/gallery
- commercial compensation demo follow-up
