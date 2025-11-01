Aditi 
User Story 1: Require Authentication for Private Discord Games

As a Discord user who wants to host or join a private game,
I want the bot to verify that only invited or authorized Discord users can access private game sessions,
so that personal data and private matches remain secure from unauthorized users.

Acceptance Criteria:
  The bot verifies the Discord IDs of players before allowing them into a private match.
  Only users with a valid invitation or matching server role can join.
  Unauthorized join attempts are denied with a clear error message.

Benefit:
Prevents outsiders from accessing private game data or conversations, increasing trust and safety in multiplayer sessions.


User Story 4: Add Security Notification System

As a Discord server moderator,
I want the bot to alert admins when it detects unusual activity, so that potential abuse or security risks 
(like spam commands or repeated join attempts) can be addressed quickly.

Acceptance Criteria:
  Bot detects more than X failed authentication attempts or repeated spam.
  Sends an automated warning message to admin/mod channel.
  Includes timestamp and user ID of the suspicious activity.
  System minimizes false positives by checking multiple events.

Benefit:
Proactively identifies security threats, allowing moderators to act before the bot or server performance is impacted.
