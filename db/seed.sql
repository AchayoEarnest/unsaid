INSERT INTO moods (id,slug,emoji,label) VALUES (1,'sad','😔','Sad'),(2,'anxious','😰','Anxious'),(3,'heartbroken','💔','Heartbroken'),(4,'angry','😡','Angry'),(5,'lonely','😞','Lonely'),(6,'exhausted','😴','Exhausted'),(7,'numb','😶','Numb'),(8,'confused','😕','Confused'),(9,'scared','😨','Scared'),(10,'need_someone','🫂','Need someone'),(11,'healing','🌱','Healing'),(12,'hopeful','😊','Hopeful'),(13,'grateful','❤️','Grateful'),(14,'motivated','🔥','Motivated'),(15,'happy','✨','Happy') ON CONFLICT DO NOTHING;
INSERT INTO topics (id,slug,label) VALUES (1,'relationships','Relationships'),(2,'school','School'),(3,'career','Career'),(4,'family','Family'),(5,'money','Money'),(6,'mental_wellbeing','Mental wellbeing'),(7,'friendship','Friendship'),(8,'life','Life'),(9,'faith','Faith'),(10,'personal_growth','Personal growth') ON CONFLICT DO NOTHING;
-- Placeholder help resources. Verify every number with the provider before launch; add rows per country.
INSERT INTO help_resources (country_code,label,contact,kind) VALUES
 ('KE','Emergency services','999 or 112','emergency'),
 ('KE','Kenya Red Cross counselling line','1199','crisis'),
 ('US','Emergency services','911','emergency'),
 ('US','988 Suicide & Crisis Lifeline','Call or text 988','crisis'),
 ('GB','Emergency services','999','emergency'),
 ('GB','Samaritans','116 123','crisis'),
 (NULL,'Find a helpline in your country','https://findahelpline.com','mental_health');
