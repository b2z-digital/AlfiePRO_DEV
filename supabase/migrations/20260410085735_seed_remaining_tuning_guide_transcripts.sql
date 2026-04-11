/*
  # Seed Remaining Rig Tuning Guide Transcripts

  1. New Data
    - Inserts 4 additional tuning guide transcripts into alfie_tuning_guides
    - Sail Creases - advice on handling sail creases and their impact on performance
    - Racing Mindset - mental approach to consistency and perseverance in racing
    - The Order to Follow When Setting Up Your Boat - systematic rig setup procedure
    - Where to Stand in Relation to Your Boat During a Race - positioning strategy during races

  2. Important Notes
    - These are transcripts from expert sailor interviews stored as text content
    - Set to status pending for processing into knowledge chunks
    - Completes the full set of 8 training transcript tuning guides
*/

INSERT INTO alfie_tuning_guides (
  id, name, boat_type, hull_type, description, input_type, content_text,
  status, is_active, chunk_count, image_count, uploaded_by
)
VALUES
(
  gen_random_uuid(),
  'Sail Creases - Impact on Performance',
  'General',
  NULL,
  'Expert advice on dealing with sail creases. Explains that most creases can be worked out with careful treatment using a plastic card, and that small creases have minimal impact on performance compared to good sailing technique.',
  'text',
  'Topic: Sail Creases and Their Impact on Performance

Question: How much do creases in sails really affect performance, and what can be done about them?

Expert Answer: It is amazing how a few little creases play more mind games with your head than what they will with your performance on the water. Now, in saying that, you can get some creases which really might hurt performance if your sail will not drop through and set in light winds on the opposite tack or from tack to tack. But I am yet to see, really, unless it goes through a seam and it is a real savage kind of crease, that the majority of creases cannot be worked out of your sails. They will not be perfect. They will not look showroom anymore, but they also will not affect you anywhere near as much as you think.

How to fix creases: If you have got a plastic cutting mat (a green cutting mat that you use your exacto blades on), lay the sail carefully on that. On the top side of a crease, use the edge of a plastic squeegee card or a bank card on the rounded corner. Very carefully on the top of that crease, just try and soothe it out. On the wrong side, on the opposite side, you will find just some real careful treatment of it helps. Even while the sail is set on the boat, you can hold the back edge (hold the leech or the back edge of the sail) and very carefully just rub that card through with very light pressure. Try a little bit more pressure, and you will gently caress out the worst part of any creases, enough to keep you going in the very lightest of breezes.

Key principle: If your sail did not set through on the opposite side, you might notice some problems. But outside of that, if you have got a powered up breeze and the sail is still going through, if it has got a couple of tiny little humps and bumps, your boat will still be better than where you put it. The reality is we sail our boats around not always perfect, but we need to be more mindful that we make more of a difference than a slight bit of trim or a little crease in the jib. You putting it in the right spot and easing your sails at the right time and tacking at the right time will make far more of a difference than a few little creases in your sail.',
  'pending',
  true,
  0,
  0,
  '0db1234b-0e7d-40c9-815e-067a844dcb7c'
),
(
  gen_random_uuid(),
  'Racing Mindset - Consistency and Perseverance',
  'General',
  NULL,
  'Mental approach to competitive racing. Covers the importance of never giving up during a race, fighting for every position, not letting equipment doubts distract from performance, and maintaining a dogged mindset on the course.',
  'text',
  'Topic: Racing Mindset - Consistency and Perseverance

Question: What mental approach separates consistent top performers from those who occasionally win races?

Expert Answer: We all know that being consistent is what works in this game. There are dozens and dozens of skippers that can win a race, or win two or three races. But what racing against top skippers taught me very quickly was that you needed to have a bit of fight when something did not go right for you. You needed to be able to just say okay, that did not work. I am instantly into a fight now for survival so I do not get demoted.

It is a mindset of knowing that every place you get past is a point better for you. There is no point racing around through the middle of the fleet and going through the motions if you are in a bigger race. If you feel you can chip someone off, go for it. This applies not just at major events but even in local club racing.

You can go home from a club race finishing fourth on the day, and you want to question yourself. Then you look around and realise the person who won is a world champion, and the next is a European champion, and the next is something else. Well, you did not have that bad a day really in the scheme of things. But if you want to beat those guys, that is kind of what they do.

Key mindset principles:

1. ABSOLUTE DOGGEDNESS: If something goes wrong, never ever give up. Keep fighting for every position until you cross the finish line. You can give up once you have gone through the finish line and pull it back in and have a think about it then.

2. RACE WHAT YOU HAVE: Whether you have the best boat there today or you have not, that does not really matter. Sail the backside off what you have in your hands and do not take an excuse for it.

3. STOP OVERTHINKING EQUIPMENT: You have got to work yourself out of constantly asking is my trim right, have I got this right, is there something wrong with my boat today. Turn it into a mindset of saying that is what I have just put on the water, the tape is on, get on and race.

4. FIGHT FOR EVERY POSITION: If you did not get a good start, put your head down and catch the next person. Put your head down, catch the next person. There is no reason not to keep pushing.',
  'pending',
  true,
  0,
  0,
  '0db1234b-0e7d-40c9-815e-067a844dcb7c'
),
(
  gen_random_uuid(),
  'The Order to Follow When Setting Up Your Boat',
  'General',
  NULL,
  'Systematic rig setup procedure covering mast RAM, backstay, kicker geometry, and outhaul settings. Explains the relationship between luff curve, mast bend, and sail trim for achieving optimal performance.',
  'text',
  'Topic: The Order to Follow When Setting Up Your Boat

Question: After setting up the vang/kicker for the downwind base twist, what is the correct order for adjusting the remaining rig controls?

Expert Answer: Once you have established your base twist from the kicker/vang downwind setting, the next steps involve the backstay and mast RAM.

BACKSTAY ADJUSTMENT: With your backstay, you are essentially trying to match on the mast, or closely match (it does not need to be absolutely spot on), the luff curve cut up the luff of the mainsail. You are trying to bend that mast so your mainsail will just sit in there nicely behind your mast.

MAST RAM ADJUSTMENT: The mast RAM at the bottom will hold the bottom of your mast a little bit straighter out of the boat. It will also close the lower leech of your mainsail. Between those two controls, they are a very fine adjustment, and you will find you get big movement in your mainsail leech.

TROUBLESHOOTING: One thing to look for -- if you cannot get a nice trim for your mainsail upwind without excessive movement on either of those controls (whether it is excessively having no backstay on, or loads of backstay on, or way too much RAM), then that is when you may need to have a look at the geometry of your kicker on the back of the mast.

VARIABLE GEOMETRY KICKERS: There is a lot talked about variable geometry kickers. I have never found one necessary. I just use a couple of little wraps of deck patch under the bottom of the gooseneck on my A rig on the one metre, and that with the setting and the curve I cut into my sails has always been fine. There are others that have the variable geometry and they swear by them. But I find it is just one extra thing, one extra adjustment that if you are not on top of it can make things worse than what it can make better.

OUTHAUL SETTING: I do not like to set sails overly deep. From the middle of the boom (the centre line) to the centre of the foot, go anywhere between 12mm to 18mm maximum. I usually specify 12 to 15mm foot depth. Once at a venue, do not fiddle with the outhaul all day. Set a nice little foot round and leave it. You will get more positive return from setting the leech of your sail correctly and matching that to your mast.',
  'pending',
  true,
  0,
  0,
  '0db1234b-0e7d-40c9-815e-067a844dcb7c'
),
(
  gen_random_uuid(),
  'Where to Stand in Relation to Your Boat During a Race',
  'General',
  NULL,
  'Course positioning strategy for radio sailing. Covers optimal standing positions during starts, upwind legs, mark roundings, and downwind legs to maintain visibility of both your boat and wind conditions.',
  'text',
  'Topic: Where to Stand in Relation to Your Boat During a Race

Question: Where should you position yourself relative to your boat at different points during a race?

Expert Answer: 

STARTING: If you cannot see your boat on a start line, a pretty general rule is move somewhere so that you can. If you cannot see your boat, how do you expect to get off the start line well and race your boat? Even if you are standing a bit too far forward of the line to get a good gauge on the line, just sheet on and go with the pack. You have more chance of getting a good start if you can see what you are actually doing rather than being tangled underneath someone.

A good rule of thumb is never try and stand directly in line with the start line because you are going to have a line of boats and you are never going to see yourself. Always stand anywhere from maybe five feet forward. You want to open that angle up a little bit so you can see your boat. This gives you depth perception of where your boat is relative to other boats around you.

UPWIND: After the start, as the fleet opens up, you want to be standing no further to windward of your boat. Your boat should be either straight out perpendicular to where you are standing, or even very slightly ahead of you. If your boat is slightly upwind of you, then as you are looking at your boat you have also opened up your vision to the course area and can see what breeze is coming down to you.

If you stand further upwind of your boat and look back downwind to it, it is a big action to turn and look over your shoulder the whole time. You will miss half of the shifts that are happening and whether you should be tacking on something or anticipating a tack. You will get boxed in and it will not work for you. Stand a little bit further behind your boat and watch what is happening up the course with the wind.

WEATHER MARK: When there is traffic at the weather mark, get to a certain place where you can see your boat and then plant your feet. Race your boat around the weather mark without moving. If there is a spreader mark, do not move your feet while sailing to it. That rounding is one of the most important roundings especially early in the race. You want to nail that rounding with a smooth coordination of sheet ease to rudder turn rate. More often than not, if you nail that rounding you will put boat lengths on people.

DOWNWIND: On the run, stand slightly ahead of your boat so you can see what wind is coming down to your boat and whether you want to gybe and hook into another shift. If you are standing behind your boat you are not seeing what wind is coming over your shoulder.

LEEWARD MARK: Plant your feet, round your mark, then let your boat sail back up to you and follow it back up the beat again.',
  'pending',
  true,
  0,
  0,
  '0db1234b-0e7d-40c9-815e-067a844dcb7c'
);
