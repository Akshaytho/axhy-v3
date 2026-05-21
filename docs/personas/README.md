# Persona-Based Document Organization

Feature specs and behavioral rules organized by role. Claude loads only the
relevant persona docs per session based on intent + file paths being touched.

## Structure

```
docs/personas/
├── admin/         ← COMPANY_ADMIN dashboard, tenant management, /overview, /attention
├── superadmin/    ← SUPER_ADMIN platform-level, multi-tenant, /system
├── supervisor/    ← Today/Summary/Updates tabs, assignments, attendance, swaps
├── worker/        ← Capture, timer, check-in/out, voice, schedule
├── hr/            ← Payroll, salary, leave, onboarding, training
└── combined/      ← Cross-role specs (shared schema, state machines, AI behavior)
```

## Rules

1. **One persona per spec** — if a spec touches multiple roles, put it in `combined/`
2. **Locked specs need amendment trail** — modifying any `.md` here requires `AXHY_FOUNDER_APPROVED=1` and an `## Amendment YYYY-MM-DD` section
3. **Smart loading** — the cognitive system's session-loader reads only the personas relevant to the current task
4. **Never duplicate** — if a rule applies to all roles, it goes in `combined/`, not copied to each folder
