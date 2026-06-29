# Firestore Security Model

Save Our Supper uses Firebase Authentication and role-based Firestore access.

## Roles

- `pending`: newly registered user waiting for approval; cannot read operational queues.
- `active_volunteer`: can submit referrals, view live orders, update order workflow state, and write notification audit events.
- `admin`: can manage operational data and update user roles.

## Collections

| Collection | Access Model |
| --- | --- |
| `users` | Users can read their own record. Admins can list users and update roles. |
| `live_orders` | Active volunteers and admins can read/write referral workflow documents. |
| `public_status` | Public users can read only an exact phone-keyed status document. Listing is denied. |
| `notification_events` | Operational roles can write audit events; admins can review them. |

## Review Notes

The public status flow deliberately exposes only a small collection status message, not the full referral queue. This keeps the public lookup useful without leaking operational records.
