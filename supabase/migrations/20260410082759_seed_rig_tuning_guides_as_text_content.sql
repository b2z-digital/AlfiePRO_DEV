/*
  # Seed Rig Tuning Guide Transcripts as AskAlfie Knowledge

  1. New Data
    - Inserts 4 tuning guide transcripts into alfie_tuning_guides as text-based guides
    - Each guide contains expert rig tuning advice from interview transcripts
    - Guides are set to status pending so they can be processed into knowledge chunks
    - input_type text so the processing pipeline uses content_text directly

  2. Guides Added
    - Checking and Re-checking Your Setup During a Race
    - Finding a Balanced Set-up
    - Optimal Sail Depth
    - Preparing for an Unfamiliar Race Course

  3. Important Notes
    - These are transcripts from expert sailor interviews stored as text content
    - Admins can trigger processing from AskAlfie Rig Tuning tab to generate knowledge chunks
    - Once processed AskAlfie will use this content when answering tuning questions
*/

INSERT INTO alfie_tuning_guides (
  id, name, boat_type, hull_type, description, input_type, content_text,
  status, is_active, chunk_count, image_count, uploaded_by
)
VALUES
(
  gen_random_uuid(),
  'Checking and Re-checking Your Setup During a Race',
  'General',
  NULL,
  'Expert advice on whether to constantly re-tune during racing or trust your base settings. Emphasises finding a balanced setup and racing the course rather than chasing the final millimetre in rigging adjustments.',
  'text',
  'Topic: Checking and Re-checking Your Setup During a Race

Question: One of the things a lot of us keep doing is constantly checking and rechecking the tune as we sail our boats. What are your thoughts about re-tuning and settings initially, and changes during racing?

Expert Answer: I am a big believer that if your boat is set up quite balanced, which is what every designer and sailor strives for, when you find a nice balance you will find that your adjustments of your rig or your sheeting will pretty much all be in your head, written on either a notebook or in permanent marker on your deck somewhere convenient.

I do not like to have a boat that I feel I need to keep making a lot of changes daily. The reality is that with the boats we sail, because we have got to stand somewhere near them, the breeze can always be quite puffy or gusty from different directions. If you have got a setup that does not handle wind pressure variations very well and you feel like you have got to constantly keep adjusting it every time you bring it back to the shore, it is just a bit of a battle.

The reality is that you have got to get that out of your head and get a slightly easier setting. Concentrate more on how you sail the boat when it is on the water -- whether you are easing or sheeting your sails in good coordination with your hand movements on the rudder.

I think it is more important to race the course well than look for the final millimetre in your rigging all the time. You can get it in your head and it plays on you the whole time. You keep asking yourself Is that right? Does not feel right. You have got to get your boat to a base setting where you can say It is what it is, and I am going to race the backside out of whatever I have put on the water. You will find that you do better that way than constantly looking to adjust.',
  'pending',
  true,
  0,
  0,
  '0db1234b-0e7d-40c9-815e-067a844dcb7c'
),
(
  gen_random_uuid(),
  'Finding a Balanced Set-up',
  'General',
  NULL,
  'Step-by-step trim procedure for setting up a balanced rig, particularly in light and gusty conditions. Covers twist, kicker/vang, shrouds, mast RAM, backstay, and matching jib to mainsail leech.',
  'text',
  'Topic: Finding a Balanced Set-up

Question: At venues with light and fluffy conditions (like sailing on a lake surrounded by trees), it can take four or five races just to get the boat balanced. What strategy would you recommend for more efficiently finding that balance -- letting everything off and then bringing things on in which order?

Expert Answer: When setting up for a day or looking at someone boat to set it up, firstly have a look at conditions. If you are sailing in light conditions on a lake surrounded by trees, you are going to get little fluffy gusts from all directions. It is always a good test.

What you want is a trim with a little bit more twist in your sails for a light, gusty condition. This makes your boat more forgiving in a weird gust from an unexpected direction.

Step-by-step procedure:

1. TWIST SETUP: Looking from behind the boat, ensure a nice amount of twist in the mainsail. The headsail will be eased and you try to match the twist angle in the jib to your mainsail leech. There can be variations dependent on design, fin type, and rake, but this is a basic starting point.

2. MAST POSITION: Eyeball your mast to be standing all but vertical, maybe the slightest bit of rake backwards. For light winds, an upright mast is probably your best starting place.

3. KICKER/VANG SETTING: Ease the sheets all the way out first. Then set the kicker so it looks nice for a running trim with a nice bit of twist. Gybe the sail over and check the twist looks exactly the same on the other tack. If it does not, you have got a sideways bend in your mast -- adjust your shrouds (side stays) until twist is equal on both sides.

4. LOCK THE KICKER: Once happy with the running trim, use the locking screw on your kicker and lock it off. Leave that set.

5. SHEET BACK ON: Sheet your sails back on. Control your mainsail twist from there using your mast RAM and backstay. Check both to give the right amount of twist.

This approach leaves your leech set perfectly for the run, and then you fine-tune for the upwind setting of the leech with those other two adjustments (mast RAM and backstay).',
  'pending',
  true,
  0,
  0,
  '0db1234b-0e7d-40c9-815e-067a844dcb7c'
),
(
  gen_random_uuid(),
  'Optimal Sail Depth',
  'General',
  NULL,
  'Guidance on outhaul and foot depth settings. Recommends 12-15mm foot depth as optimal, warns against diminishing returns from going too deep, and advises setting it once rather than fiddling all day.',
  'text',
  'Topic: Optimal Sail Depth

Question: How deep should I set my mainsail using the outhaul? How much depth can I get away with?

Expert Answer: I do not like to set sails overly deep. A lot of people like to set them deep.

There is one school of thought that you want a grunty, powerful sail in lighter winds. But in all but the lightest of winds, the deeper you make the sail, the further the air has to bend around it. So you reach a point of diminishing returns once you start going for too much depth.

Measurement guide: From the middle of the boom (centre line) to the centre of the foot, I would go anywhere between 12mm to 18mm maximum. I usually specify 12 to 15mm foot depth.

Key principle: Once you are at a venue, do not fiddle with the outhaul all day. Just set a nice little foot round and leave it. You will get more positive return from setting the leech of your sail correctly and matching that to your mast than from constantly adjusting foot depth.',
  'pending',
  true,
  0,
  0,
  '0db1234b-0e7d-40c9-815e-067a844dcb7c'
),
(
  gen_random_uuid(),
  'Preparing for an Unfamiliar Race Course',
  'General',
  NULL,
  'Strategy for arriving at a new regatta venue. Covers checking weather, talking to locals, reading tidal flow, timing practice runs to the start line, and having base rig settings prepared beforehand.',
  'text',
  'Topic: Preparing for an Unfamiliar Race Course

Question: When you come to a regatta for the first time, what do you look at about the course and your boat to decide how to handle the upcoming event?

Expert Answer: Try to arrive the night before if possible.

On the morning of the first day:

1. SURVEY THE COURSE: Have a look at the course area. Check what kind of weather is expected for the day.

2. TALK TO LOCALS: If you have not been to that venue before, chat with the locals. Get a bit of an ear on anything particular to that course area. There can always be certain pointers on things you might like to avoid or take advantage of.

3. READ THE TIDE/CURRENT: This is something that does not happen enough, especially for skippers who do most of their sailing in landlocked areas or ponds and then go to sail on open water. A lot of people make the mistake of not getting a read on the tide or flow in the water. This can be very important, especially on start lines and picking lay lines into windward marks.

4. TIME YOUR APPROACHES: Do a little bit of timing -- walk through runs into a start line and get a handle on how long it takes. For example, from 10 feet out in sheeting-on position, it might take 15 seconds in light wind if you are beating into a tide.

5. PRACTICE SAIL: Try to put your boat in the water for 10-15 minutes before racing to get a feel of the course.

6. PREPARE SETTINGS IN ADVANCE: Have an idea on all your settings before you travel to the event. You might tailor your rig and sail settings slightly towards a certain venue, but have base settings already established. Do not turn up and fly blind.

7. STAY RELAXED: Try and keep relaxed. Just sail up and down the course area, get a read on what the wind is doing, and take it from there.',
  'pending',
  true,
  0,
  0,
  '0db1234b-0e7d-40c9-815e-067a844dcb7c'
);
