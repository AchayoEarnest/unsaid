-- Social-login users are treated as minors (most protected) until they confirm their age group.
ALTER TABLE users ADD COLUMN age_confirmed boolean NOT NULL DEFAULT true;
