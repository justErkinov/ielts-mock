"""
Loads Cambridge IELTS 13 Academic, Test 1 into the database:
  - Listening: 4 tests (Part 1..4), 10 questions each
  - Reading: 1 test, 3 passages, 40 questions
  - Writing: 1 test (Task 1 + Task 2)

Safe to run again: existing tests with the same titles are deleted and recreated.
Usage:  python manage.py load_cambridge13

Answers with several accepted spellings are separated by "|", e.g. "brain|brains".
Images live in frontend/public/images/ and are referenced as [img:/images/...].
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction

from listening.models import ListeningTest, ListeningQuestion
from reading.models import ReadingTest, ReadingPassage, ReadingQuestion
from writing.models import WritingTest

AUDIO = "https://leninonline.wordpress.com/wp-content/uploads/2022/03/ielts13-tests1-4cd1track_0{}.mp3"

# (number, type, group_title, group_instruction, text, options, answer)
LISTENING = {
    1: [
        *[(n, "gap_fill", "Questions 1-10",
           "Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer.",
           t, None, a) for n, t, a in [
            (1, "The Food Studio: shows you how to ___ and cook with seasonal products", "choose"),
            (2, "The Food Studio: also offers ___ classes", "private"),
            (3, "The Food Studio: clients who return get a ___ percent discount", "20|twenty"),
            (4, "Bond's Cookery School: focus on food that is ___", "healthy"),
            (5, "Bond's Cookery School: includes recipes to strengthen your ___", "bones"),
            (6, "Bond's Cookery School: they have a free ___ every Thursday", "lecture"),
            (7, "The ___ Centre", "Arretsa"),
            (8, "This centre focuses mainly on ___ food", "vegetarian"),
            (9, "This centre is located near the ___", "market"),
            (10, "A special course in skills with a ___ is sometimes available", "knife"),
        ]],
    ],
    2: [
        (11, "mcq", "Questions 11-13", "Choose the correct letter, A, B or C.",
         "Why are changes needed to traffic systems in Granford?",
         ["The number of traffic accidents has risen.",
          "The amount of traffic on the roads has increased.",
          "The types of vehicles on the roads have changed."],
         "The amount of traffic on the roads has increased."),
        (12, "mcq", "Questions 11-13", "Choose the correct letter, A, B or C.",
         "In a survey, local residents particularly complained about",
         ["dangerous driving by parents.", "pollution from trucks and lorries.",
          "inconvenience from parked cars."],
         "inconvenience from parked cars."),
        (13, "mcq", "Questions 11-13", "Choose the correct letter, A, B or C.",
         "According to the speaker, one problem with the new regulations will be",
         ["raising money to pay for them.", "finding a way to make people follow them.",
          "getting the support of the police."],
         "finding a way to make people follow them."),
        *[(n, "gap_fill", "Questions 14-20",
           "[img:/images/c13-l1-map.jpg] Label the map. Write the correct letter, A-I.",
           t, None, a) for n, t, a in [
            (14, "New traffic lights: ___", "g"),
            (15, "Pedestrian crossing: ___", "c"),
            (16, "Parking allowed: ___", "b"),
            (17, "New 'No Parking' sign: ___", "d"),
            (18, "New disabled parking spaces: ___", "a"),
            (19, "Widened pavement: ___", "f"),
            (20, "Lorry loading/unloading restrictions: ___", "h"),
        ]],
    ],
    3: [
        (21, "mcq", "Questions 21-25", "Choose the correct letter, A, B or C.",
         "Why is Jack interested in investigating seed germination?",
         ["He may do a module on a related topic later on.",
          "He wants to have a career in plant science.",
          "He is thinking of choosing this topic for his dissertation."],
         "He may do a module on a related topic later on."),
        (22, "mcq", "Questions 21-25", "Choose the correct letter, A, B or C.",
         "Jack and Emma agree the main advantage of their present experiment is that it can be",
         ["described very easily.", "carried out inside the laboratory.",
          "completed in the time available."],
         "completed in the time available."),
        (23, "mcq", "Questions 21-25", "Choose the correct letter, A, B or C.",
         "What do they decide to check with their tutor?",
         ["whether their aim is appropriate", "whether anyone else has chosen this topic",
          "whether the assignment contributes to their final grade"],
         "whether anyone else has chosen this topic"),
        (24, "mcq", "Questions 21-25", "Choose the correct letter, A, B or C.",
         "They agree that Graves' book on seed germination is disappointing because",
         ["it fails to cover recent advances in seed science.",
          "the content is irrelevant for them.", "its focus is very theoretical."],
         "its focus is very theoretical."),
        (25, "mcq", "Questions 21-25", "Choose the correct letter, A, B or C.",
         "What does Jack say about the article on seed germination by Lee Hall?",
         ["The diagrams of plant development are useful.",
          "The analysis of seed germination statistics is thorough.",
          "The findings on seed germination after fires are surprising."],
         "The analysis of seed germination statistics is thorough."),
        *[(n, "mcq", "Questions 26-30",
           "Complete the flow-chart: stages in the experiment. Choose the correct answer for each step.",
           t, ["container", "soil", "weight", "condition", "height", "colour", "types", "depths"], a)
          for n, t, a in [
            (26, "Select seeds of different ___ and sizes.", "types"),
            (27, "Measure and record the ___ and size of each one.", "weight"),
            (28, "Decide on the ___ to be used.", "depths"),
            (29, "Use a different ___ for each seed and label it.", "container"),
            (30, "After about 3 weeks, record the plant's ___.", "height"),
        ]],
    ],
    4: [
        *[(n, "gap_fill", "Questions 31-40",
           "Effects of urban environments on animals. Complete the notes below. Write ONE WORD ONLY for each answer.",
           t, None, a) for n, t, a in [
            (31, "It was thought only a few animals suited city life, e.g. the ___ because of its general adaptability", "crow|crows"),
            (32, "the pigeon, because walls of city buildings are similar to ___", "cliffs"),
            (33, "In fact, many urban animals are adapting with unusual ___", "speed"),
            (34, "Emilie Snell-Rood found the size of their ___ had increased", "brain|brains"),
            (35, "This may be due to the need to locate new sources of ___ and to deal with new dangers", "food"),
            (36, "Catarina Miranda focused on the ___ of urban and rural blackbirds", "behaviour|behavior"),
            (37, "Urban birds were braver, but were afraid of situations that were ___", "new"),
            (38, "Jonathan Atwell found some animals respond to ___ by producing lower levels of hormones", "stress"),
            (39, "Sarah Partan's team found urban squirrels use their ___ to help them communicate", "tails|tail"),
            (40, "However, some changes may not be ___", "permanent"),
        ]],
    ],
}

READING_PASSAGES = [
    (1, "Case Study: Tourism New Zealand website", """New Zealand is a small country of four million inhabitants, a long-haul flight from all the major tourist-generating markets of the world. Tourism currently makes up 9% of the country's gross domestic product, and is the country's largest export sector. Unlike other export sectors, which make products and then sell them overseas, tourism brings its customers to New Zealand. The product is the country itself – the people, the places and the experiences. In 1999, Tourism New Zealand launched a campaign to communicate a new brand position to the world. The campaign focused on New Zealand's scenic beauty, exhilarating outdoor activities and authentic Maori culture, and it made New Zealand one of the strongest national brands in the world.

A key feature of the campaign was the website newzealand.com, which provided potential visitors to New Zealand with a single gateway to everything the destination had to offer. The heart of the website was a database of tourism services operators, both those based in New Zealand and those based abroad which offered tourism service to the country. Any tourism-related business could be listed by filling in a simple form. This meant that even the smallest bed and breakfast address or specialist activity provider could gain a web presence with access to an audience of long-haul visitors. In addition, because participating businesses were able to update the details they gave on a regular basis, the information provided remained accurate. And to maintain and improve standards, Tourism New Zealand organised a scheme whereby organisations appearing on the website underwent an independent evaluation against a set of agreed national standards of quality. As part of this, the effect of each business on the environment was considered.

To communicate the New Zealand experience, the site also carried features relating to famous people and places. One of the most popular was an interview with former New Zealand All Blacks rugby captain Tana Umaga. Another feature that attracted a lot of attention was an interactive journey through a number of the locations chosen for blockbuster films which had made use of New Zealand's stunning scenery as a backdrop. As the site developed, additional features were added to help independent travelers devise their own customised itineraries. To make it easier to plan motoring holidays, the site catalogued the most popular driving routes in the country, highlighting different routes according to the season and indicating distances and times.

Later, a Travel Planner feature was added, which allowed visitors to click and 'bookmark' places or attractions they were interested in, and then view the results on a map. The Travel Planner offered suggested routes and public transport options between the chosen locations. There were also links to accommodation in the area. By registering with the website, users could save their Travel Plan and return to it later, or print it out to take on the visit. The website also had a 'Your Words' section where anyone could submit a blog of their New Zealand travels for possible inclusion on the website.

The Tourism New Zealand website won two Webby awards for online achievement and innovation. More importantly perhaps, the growth of tourism to New Zealand was impressive. Overall tourism expenditure increased by an average of 6.9% per year between 1999 and 2004. From Britain, visits to New Zealand grew at an average annual rate of 13% between 2002 and 2006, compared to a rate of 4% overall for British visits abroad.

The website was set up to allow both individuals and travel organisations to create itineraries and travel packages to suit their own needs and interests. On the website, visitors can search for activities not solely by geographical location, but also by the particular nature of the activity. This is important as research shows that activities are the key driver of visitor satisfaction, contributing 74% to visitor satisfaction, while transport and accommodation account for the remaining 26%. The more activities that visitors undertake, the more satisfied they will be. It has also been found that visitors enjoy cultural activities most when they are interactive, such as visiting a marae (meeting ground) to learn about traditional Maori life. Many long-haul travelers enjoy such learning experiences, which provide them with stories to take home to their friends and family. In addition, it appears that visitors to New Zealand don't want to be 'one of the crowd' and find activities that involve only a few people more special and meaningful.

It could be argued that New Zealand is not a typical destination. New Zealand is a small country with a visitor economy composed mainly of small businesses. It is generally perceived as a safe English-speaking country with a reliable transport infrastructure. Because of the long-haul flight, most visitors stay for longer (average 20 days) and want to see as much of the country as possible on what is often seen as a once-in-a-lifetime visit. However, the underlying lessons apply anywhere – the effectiveness of a strong brand, a strategy based on unique experiences and a comprehensive and user-friendly website."""),
    (2, "Why being bored is stimulating – and useful, too", """A
We all know how it feels – it's impossible to keep your mind on anything, time stretches out, and all the things you could do seem equally unlikely to make you feel better. But defining boredom so that it can be studied in the lab has proved difficult. For a start, it can include a lot of other mental states, such as frustration, apathy, depression and indifference. There isn't even agreement over whether boredom is always a low-energy, flat kind of emotion or whether feeling agitated and restless counts as boredom, too. In his book, Boredom: A Lively History, Peter Toohey at the University of Calgary, Canada, compares it to disgust – an emotion that motivates us to stay away from certain situations. 'If disgust protects humans from infection, boredom may protect them from "infectious" social situations,' he suggests.

B
By asking people about their experiences of boredom, Thomas Goetz and his team at the University of Konstanz in Germany have recently identified five distinct types: indifferent, calibrating, searching, reactant and apathetic. These can be plotted on two axes – one running left to right, which measures low to high arousal, and the other from top to bottom, which measures how positive or negative the feeling is. Intriguingly, Goetz has found that while people experience all kinds of boredom, they tend to specialise in one. Of the five types, the most damaging is 'reactant' boredom with its explosive combination of high arousal and negative emotion. The most useful is what Goetz calls 'indifferent' boredom: someone isn't engaged in anything satisfying but still feels relaxed and calm. However, it remains to be seen whether there are any character traits that predict the kind of boredom each of us might be prone to.

C
Psychologist Sandi Mann at the University of Central Lancashire, UK, goes further. 'All emotions are there for a reason, including boredom,' she says. Mann has found that being bored makes us more creative. 'We're all afraid of being bored but in actual fact it can lead to all kinds of amazing things,' she says. In experiments published last year, Mann found that people who had been made to feel bored by copying numbers out of the phone book for 15 minutes came up with more creative ideas about how to use a polystyrene cup than a control group. Mann concluded that a passive, boring activity is best for creativity because it allows the mind to wander. In fact, she goes so far as to suggest that we should seek out more boredom in our lives.

D
Psychologist John Eastwood at York University in Toronto, Canada, isn't convinced. 'If you are in a state of mind-wandering you are not bored,' he says. 'In my view, by definition boredom is an undesirable state.' That doesn't necessarily mean that it isn't adaptive, he adds. 'Pain is adaptive – if we didn't have physical pain, bad things would happen to us. Does that mean that we should actively cause pain? No. But even if boredom has evolved to help us survive, it can still be toxic if allowed to fester.' For Eastwood, the central feature of boredom is a failure to put our 'attention system' into gear. This causes an inability to focus on anything, which makes time seem to go painfully slowly. What's more, your efforts to improve the situation can end up making you feel worse. 'People try to connect with the world and if they are not successful there's that frustration and irritability,' he says. Perhaps most worryingly, says Eastwood, repeatedly failing to engage attention can lead to state where we don't know what to do any more, and no longer care.

E
Eastwood's team is now trying to explore why the attention system fails. It's early days but they think that at least some of it comes down to personality. Boredom proneness has been linked with a variety of traits. People who are motivated by pleasure seem to suffer particularly badly. Other personality traits, such as curiosity, are associated with a high boredom threshold. More evidence that boredom has detrimental effects comes from studies of people who are more or less prone to boredom. It seems those who bore easily face poorer prospects in education, their career and even life in general. But of course, boredom itself cannot kill – it's the things we do to deal with it that may put us in danger. What can we do to alleviate it before it comes to that? Goetz's group has one suggestion. Working with teenagers, they found that those who 'approach' a boring situation – in other words, see that it's boring and get stuck in anyway – report less boredom than those who try to avoid it by using snacks, TV or social media for distraction.

F
Psychologist Francoise Wemelsfelder speculates that our over-connected lifestyles might even be a new source of boredom. 'In modern human society there is a lot of overstimulation but still a lot of problems finding meaning,' she says. So instead of seeking yet more mental stimulation, perhaps we should leave our phones alone, and use boredom to motivate us to engage with the world in a more meaningful way."""),
    (3, "Artificial artist? Can computers really create works of art?", """The Painting Fool is one of a growing number of computer programs which, so their makers claim, possess creative talents. Classical music by an artificial composer has had audiences enraptured, and even tricked them into believing a human was behind the score. Artworks painted by a robot have sold for thousands of dollars and been hung in prestigious galleries. And software has been built which creates art that could not have been imagined by the programmer.

Human beings are the only species to perform sophisticated creative acts regularly. If we can break this process down into computer code, where does that leave human creativity? 'This is a question at the very core of humanity,' says Geraint Wiggins, a computational creativity researcher at Goldsmiths, University of London. 'It scares a lot of people. They are worried that it is taking something special away from what it means to be human.'

To some extent, we are all familiar with computerised art. The question is: where does the work of the artist stop and the creativity of the computer begin? Consider one of the oldest machine artists, Aaron, a robot that has had paintings exhibited in London's Tate Modern and the San Francisco Museum of Modern Art. Aaron can pick up a paintbrush and paint on canvas on its own. Impressive perhaps, but it is still little more than a tool to realise the programmer's own creative ideas.

Simon Colton, the designer of the Painting Fool, is keen to make sure his creation doesn't attract the same criticism. Unlike earlier 'artists' such as Aaron, the Painting Fool only needs minimal direction and can come up with its own concepts by going online for material. The software runs its own web searches and trawls through social media sites. It is now beginning to display a kind of imagination too, creating pictures from scratch. One of its original works is a series of fuzzy landscapes, depicting trees and sky. While some might say they have a mechanical look, Colton argues that such reactions arise from people's double standards towards software-produced and human-produced art. After all, he says, consider that the Painting Fool painted the landscapes without referring to a photo. 'If a child painted a new scene from its head, you'd say it has a certain level of imagination,' he points out. 'The same should be true of a machine.' Software bugs can also lead to unexpected results. Some of the Painting Fool's paintings of a chair came out in black and white, thanks to a technical glitch. This gives the work an eerie, ghostlike quality. Human artists like the renowned Ellsworth Kelly are lauded for limiting their colour palette – so why should computers be any different?

Researchers like Colton don't believe it is right to measure machine creativity directly to that of humans who 'have had millennia to develop our skills'. Others, though, are fascinated by the prospect that a computer might create something as original and subtle as our best artists. So far, only one has come close. Composer David Cope invented a program called Experiments in Musical Intelligence, or EMI. Not only did EMI create compositions in Cope's style, but also that of the most revered classical composers, including Bach, Chopin and Mozart. Audiences were moved to tears, and EMI even fooled classical music experts into thinking they were hearing genuine Bach. Not everyone was impressed however. Some, such as Wiggins, have blasted Cope's work as pseudoscience, and condemned him for his deliberately vague explanation of how the software worked. Meanwhile, Douglas Hofstadter of Indiana University said EMI created replicas which still rely completely on the original artist's creative impulses. When audiences found out the truth they were often outraged with Cope, and one music lover even tried to punch him. Amid such controversy, Cope destroyed EMI's vital databases.

But why did so many people love the music, yet recoil when they discovered how it was composed? A study by computer scientist David Moffat of Glasgow Caledonian University provides a clue. He asked both expert musicians and non-experts to assess six compositions. The participants weren't told beforehand whether the tunes were composed by humans or computers, but were asked to guess, and then rate how much they liked each one. People who thought the composer was a computer tended to dislike the piece more than those who believed it was human. This was true even among the experts, who might have been expected to be more objective in their analyses.

Where does this prejudice come from? Paul Bloom of Yale University has a suggestion: he reckons part of the pleasure we get from art stems from the creative process behind the work. This can give it an 'irresistible essence', says Bloom. Meanwhile, experiments by Justin Kruger of New York University have shown that people's enjoyment of an artwork increases if they think more time and effort was needed to create it. Similarly, Colton thinks that when people experience art, they wonder what the artist might have been thinking or what the artist is trying to tell them. It seems obvious, therefore, that with computers producing art, this speculation is cut short – there's nothing to explore. But as technology becomes increasingly complex, finding those greater depths in computer art could become possible. This is precisely why Colton asks the Painting Fool to tap into online social networks for its inspiration: hopefully this way it will choose themes that will already be meaningful to us."""),
]

TFNG = ["TRUE", "FALSE", "NOT GIVEN"]
HEADINGS = ["i. The productive outcomes that may result from boredom",
            "ii. What teachers can do to prevent boredom",
            "iii. A new explanation and a new cure for boredom",
            "iv. Problems with a scientific approach to boredom",
            "v. A potential danger arising from boredom",
            "vi. Creating a system of classification for feelings of boredom",
            "vii. Age groups most affected by boredom",
            "viii. Identifying those most affected by boredom"]
IDEAS = ["The way we live today may encourage boredom.",
         "One sort of boredom is worse than all the others.",
         "Levels of boredom may fall in the future.",
         "Trying to cope with boredom can increase its negative effects.",
         "Boredom may encourage us to avoid an unpleasant experience."]
ENDINGS = ["generating work that was virtually indistinguishable from that of humans.",
           "knowing whether it was the work of humans or software.",
           "producing work entirely dependent on the imagination of its creator.",
           "comparing the artistic achievements of humans and computers.",
           "revealing the technical details of his program.",
           "persuading the public to appreciate computer art.",
           "discovering that it was the product of a computer program."]
YNNG = ["YES", "NO", "NOT GIVEN"]

# passage_number -> list of (number, type, text, options, answer)
READING_QUESTIONS = {
    1: [
        (1, "gap_fill", "Database: allowed businesses to ___ information regularly (ONE WORD)", None, "update"),
        (2, "gap_fill", "Database: evaluation of businesses, including their impact on the ___ (ONE WORD)", None, "environment"),
        (3, "gap_fill", "Special features: an interview with a former sports ___ (ONE WORD)", None, "captain"),
        (4, "gap_fill", "Special features: an interactive tour of various locations used in ___ (ONE WORD)", None, "films"),
        (5, "gap_fill", "Driving routes: varied depending on the ___ (ONE WORD)", None, "season|seasons"),
        (6, "gap_fill", "Travel Planner: a map, public transport and local ___ (ONE WORD)", None, "accommodation"),
        (7, "gap_fill", "'Your Words': travelers could send a link to their ___ (ONE WORD)", None, "blog|blogs"),
        (8, "tfng", "The website aimed to provide ready-made itineraries and packages for travel companies and individual tourists.", None, "FALSE"),
        (9, "tfng", "It was found that most visitors started searching on the website by geographical location.", None, "NOT GIVEN"),
        (10, "tfng", "According to research, 26% of visitor satisfaction is related to their accommodation.", None, "FALSE"),
        (11, "tfng", "Visitors to New Zealand like to become involved in the local culture.", None, "TRUE"),
        (12, "tfng", "Visitors like staying in small hotels in New Zealand rather than in larger ones.", None, "NOT GIVEN"),
        (13, "tfng", "Many visitors feel it is unlikely that they will return to New Zealand after their visit.", None, "TRUE"),
    ],
    2: [
        (14, "mcq", "Choose the correct heading for Paragraph A", HEADINGS, HEADINGS[3]),
        (15, "mcq", "Choose the correct heading for Paragraph B", HEADINGS, HEADINGS[5]),
        (16, "mcq", "Choose the correct heading for Paragraph C", HEADINGS, HEADINGS[0]),
        (17, "mcq", "Choose the correct heading for Paragraph D", HEADINGS, HEADINGS[4]),
        (18, "mcq", "Choose the correct heading for Paragraph E", HEADINGS, HEADINGS[7]),
        (19, "mcq", "Choose the correct heading for Paragraph F", HEADINGS, HEADINGS[2]),
        (20, "mcq", "Match the person with the correct idea: Peter Toohey", IDEAS, IDEAS[4]),
        (21, "mcq", "Match the person with the correct idea: Thomas Goetz", IDEAS, IDEAS[1]),
        (22, "mcq", "Match the person with the correct idea: John Eastwood", IDEAS, IDEAS[3]),
        (23, "mcq", "Match the person with the correct idea: Francoise Wemelsfelder", IDEAS, IDEAS[0]),
        (24, "gap_fill", "For John Eastwood, the central feature of boredom is that people cannot ___ (ONE WORD)", None, "focus"),
        (25, "gap_fill", "Those for whom ___ is an important aim in life may have problems coping with boredom (ONE WORD)", None, "pleasure"),
        (26, "gap_fill", "Those who have the characteristic of ___ can generally cope with boredom (ONE WORD)", None, "curiosity"),
    ],
    3: [
        (27, "mcq", "What is the writer suggesting about computer-produced works in the first paragraph?",
         ["People's acceptance of them can vary considerably.",
          "A great deal of progress has already been attained in this field.",
          "They have had more success in some artistic genres than in others.",
          "The advances are not as significant as the public believes them to be."],
         "A great deal of progress has already been attained in this field."),
        (28, "mcq", "According to Geraint Wiggins, why are many people worried by computer art?",
         ["It is aesthetically inferior to human art.", "It may ultimately supersede human art.",
          "It undermines a fundamental human quality.", "It will lead to a deterioration in human ability."],
         "It undermines a fundamental human quality."),
        (29, "mcq", "What is a key difference between Aaron and the Painting Fool?",
         ["its programmer's background", "public response to its work",
          "the source of its subject matter", "the technical standard of its output"],
         "the source of its subject matter"),
        (30, "mcq", "What point does Simon Colton make in the fourth paragraph?",
         ["Software-produced art is often dismissed as childish and simplistic.",
          "The same concepts of creativity should not be applied to all forms of art.",
          "It is unreasonable to expect a machine to be as imaginative as a human being.",
          "People tend to judge computer art and human art according to different criteria."],
         "People tend to judge computer art and human art according to different criteria."),
        (31, "mcq", "The writer refers to the paintings of a chair as an example of computer art which",
         ["achieves a particularly striking effect.", "exhibits a certain level of genuine artistic skill.",
          "closely resembles that of a well-known artist.", "highlights the technical limitations of the software."],
         "achieves a particularly striking effect."),
        (32, "mcq", "Simon Colton says it is important to consider the long-term view when ...", ENDINGS, ENDINGS[3]),
        (33, "mcq", "David Cope's EMI software surprised people by ...", ENDINGS, ENDINGS[0]),
        (34, "mcq", "Geraint Wiggins criticised Cope for not ...", ENDINGS, ENDINGS[4]),
        (35, "mcq", "Douglas Hofstadter claimed that EMI was ...", ENDINGS, ENDINGS[2]),
        (36, "mcq", "Audiences who had listened to EMI's music became angry after ...", ENDINGS, ENDINGS[6]),
        (37, "mcq", "The participants in David Moffat's study had to assess music without ...", ENDINGS, ENDINGS[1]),
        (38, "mcq", "YES / NO / NOT GIVEN: Moffat's research may help explain people's reactions to EMI.", YNNG, "YES"),
        (39, "mcq", "YES / NO / NOT GIVEN: The non-experts in Moffat's study all responded in a predictable way.", YNNG, "NOT GIVEN"),
        (40, "mcq", "YES / NO / NOT GIVEN: Justin Kruger's findings cast doubt on Paul Bloom's theory about people's prejudice towards computer art.", YNNG, "NO"),
    ],
}

WRITING_TASK1 = """[img:/images/c13-w1-maps.jpg]
The two maps below show road access to a city hospital in 2007 and in 2010.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

You should spend about 20 minutes on this task. Write at least 150 words."""

WRITING_TASK2 = """Living in a country where you have to speak a foreign language can cause serious social problems, as well as practical problems.

To what extent do you agree or disagree with this statement?

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

You should spend about 40 minutes on this task. Write at least 250 words."""


class Command(BaseCommand):
    help = "Load Cambridge IELTS 13 Academic Test 1 (Listening, Reading, Writing)."

    @transaction.atomic
    def handle(self, *args, **options):
        owner = get_user_model().objects.filter(is_superuser=True).first()

        # Listening: 4 parts
        for part, questions in LISTENING.items():
            title = f"Cambridge IELTS 13 — Test 1, Part {part}"
            ListeningTest.objects.filter(title=title).delete()
            test = ListeningTest.objects.create(
                title=title, audio_url=AUDIO.format(part), is_active=True, created_by=owner)
            for n, qtype, gtitle, ginstr, text, opts, ans in questions:
                ListeningQuestion.objects.create(
                    test=test, question_number=n, question_type=qtype,
                    group_title=gtitle, group_instruction=ginstr,
                    question_text=text, options=opts, correct_answer=ans)
            self.stdout.write(f"Listening Part {part}: {len(questions)} questions")

        # Reading
        title = "Cambridge IELTS 13 — Reading Test 1"
        ReadingTest.objects.filter(title=title).delete()
        rtest = ReadingTest.objects.create(title=title, is_active=True, created_by=owner)
        total = 0
        for num, ptitle, text in READING_PASSAGES:
            passage = ReadingPassage.objects.create(test=rtest, passage_number=num, title=ptitle, text=text)
            for n, qtype, qtext, opts, ans in READING_QUESTIONS[num]:
                ReadingQuestion.objects.create(
                    passage=passage, question_number=n, question_type=qtype,
                    question_text=qtext, options=opts, correct_answer=ans)
                total += 1
        self.stdout.write(f"Reading: 3 passages, {total} questions")

        # Writing
        title = "Cambridge IELTS 13 — Writing Test 1"
        WritingTest.objects.filter(title=title).delete()
        WritingTest.objects.create(title=title, task1_question=WRITING_TASK1,
                                   task2_question=WRITING_TASK2, is_active=True, created_by=owner)
        self.stdout.write("Writing: Task 1 + Task 2")

        self.stdout.write(self.style.SUCCESS("Cambridge IELTS 13 Test 1 loaded."))
