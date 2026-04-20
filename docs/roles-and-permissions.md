# Roles & Permissions

KernCMS has two role layers: **system roles** (global, across the platform) and **project roles** (per-project membership).

---

## System Roles

Defined in `src/db/schema.ts`. Every user has exactly one system role.

### Superadmin

- Full platform access
- Configure GitHub App integration
- Configure AI providers (Anthropic / OpenAI)
- Configure Resend email service
- Manage all system users (view, change roles, delete)
- Can change admin users' roles
- Cannot be assigned via API (only via initial seeding)
- Cannot change own system role

### Admin

- Manage system members (limited: cannot modify other admins or superadmins)
- Invite new system members
- Configure GitHub App, AI, and Resend settings
- Access admin sections in profile dialog (Members)
- Cannot access superadmin-only sections (Integrations, AI)

### Member

- Default role for new users
- View own profile and account settings
- Access projects they've been invited to
- No system administration access

---

## Project Roles

Defined in `src/db/schema.ts`. A user can have a different role in each project.

### Project Admin

| Action              | Allowed |
| ------------------- | ------- |
| View dashboard      | Yes     |
| Edit content        | Yes     |
| Manage media        | Yes     |
| Edit project settings | Yes   |
| Invite users        | Yes     |
| Change roles        | Yes     |
| Remove users        | Yes     |
| Delete project      | Yes     |

### Editor

| Action              | Allowed |
| ------------------- | ------- |
| View dashboard      | Yes     |
| Edit content        | Yes     |
| Manage media        | Yes     |
| Edit project settings | No    |
| Invite users        | No      |
| Change roles        | No      |
| Remove users        | No      |
| Delete project      | No      |

### Viewer

| Action              | Allowed |
| ------------------- | ------- |
| View dashboard      | Yes     |
| Edit content        | No      |
| Manage media        | No      |
| Edit project settings | No    |
| Invite users        | No      |
| Change roles        | No      |
| Remove users        | No      |
| Delete project      | No      |

---

## UI Visibility

### Profile Dialog Sections

| Section        | Superadmin | Admin | Member |
| -------------- | ---------- | ----- | ------ |
| Profile        | Yes        | Yes   | Yes    |
| Account        | Yes        | Yes   | Yes    |
| Preferences    | Yes        | Yes   | Yes    |
| Notifications  | Yes        | Yes   | Yes    |
| Members        | Yes        | Yes   | No     |
| Integrations   | Yes        | No    | No     |
| AI             | Yes        | No    | No     |

### Project Settings

Only accessible to system admins or users with the **admin** role in the current project.

---

## Key Rules

- **Self-removal**: Any project member can remove themselves from a project, regardless of role.
- **Self-modification block**: Users cannot change their own system role.
- **Role escalation protection**: The superadmin role cannot be assigned through the API.
- **System invites**: Requires the `admin` system role.
