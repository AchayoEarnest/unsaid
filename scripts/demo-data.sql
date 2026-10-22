-- Demo community: fictional users and approved posts so the wall isn't empty. Safe to run once.
DO $$
DECLARE r record; uid uuid; pid uuid;
BEGIN
FOR r IN SELECT * FROM (VALUES
 ('Wanjiru','nickname','I feel like everyone is moving forward except me.','lonely','life'),
 ('Anon','anonymous','Some days I wake up already exhausted. I don’t know why.','exhausted','mental_wellbeing'),
 ('LostButTrying','nickname','I thought I would have everything figured out by 25. I clearly don’t.','confused','life'),
 ('Brian','real_name','Today wasn’t perfect, but I survived a really difficult week and I’m proud of myself.','hopeful','personal_growth'),
 ('Anon','anonymous','I’m tired of pretending I’m okay.','numb','mental_wellbeing'),
 ('Kip','nickname','Exam week is eating me alive. I can’t switch my brain off.','anxious','school'),
 ('Anon','anonymous','I don’t want advice. I just want someone to hear me.','need_someone','relationships'),
 ('Amani','nickname','I finally had a good day. I almost forgot how that feels.','happy','personal_growth'),
 ('Anon','anonymous','I’m scared about my future and money.','scared','money'),
 ('Moonlit','nickname','I’m healing slowly. Some mornings it’s just getting out of bed.','healing','mental_wellbeing'),
 ('Anon','anonymous','Two years since we broke up. I still reach for my phone to tell you things.','heartbroken','relationships'),
 ('Zuri','nickname','My family doesn’t understand my career choice and it hurts.','sad','family'),
 ('Otieno','nickname','Started running again. Small steps, but they’re mine.','motivated','personal_growth'),
 ('Anon','anonymous','Grateful for the stranger who replied last night. You don’t know what it meant.','grateful','faith')
) AS t(nick,ident,body,mood,topic)
LOOP
  INSERT INTO users (email,is_minor) VALUES ('demo-'||gen_random_uuid()||'@example.invalid', false) RETURNING id INTO uid;
  INSERT INTO profiles (user_id,nickname) VALUES (uid, CASE WHEN r.nick='Anon' THEN 'Friend'||floor(random()*9000+1000)::int ELSE r.nick END);
  INSERT INTO posts (author_id,identity,body,mod_status) VALUES (uid, r.ident::identity_mode, r.body, 'approved') RETURNING id INTO pid;
  INSERT INTO post_moods SELECT pid,id FROM moods WHERE slug=r.mood;
  INSERT INTO post_topics SELECT pid,id FROM topics WHERE slug=r.topic;
END LOOP;
INSERT INTO comments (post_id,author_id,kind,body,mod_status)
  SELECT p.id,(SELECT id FROM users u WHERE u.email LIKE 'demo-%' AND u.id<>p.author_id ORDER BY random() LIMIT 1),'support',
    (ARRAY['You’re not alone. Take it one day at a time.','I’ve felt exactly like this. It does get lighter.','Thank you for saying this out loud. I’m here.'])[1+floor(random()*3)::int],'approved'
  FROM posts p WHERE p.mod_status='approved';
END $$;
