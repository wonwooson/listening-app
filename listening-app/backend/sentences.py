"""A single caption track, displayed as sentences without changing source records."""
import re
from pathlib import Path
from collections import defaultdict

# Editorial punctuation only, based on the supplied transcript, not audio verification.
OPENING = [
 ("hello i'm gav", "Hello, I'm Gav."),
 ("i'm dan", "I'm Dan."),
 ("we're back at the colorado school of mins our favorite place for blowing things up", "We're back at the Colorado School of mins, our favorite place for blowing things up."),
 ("it'd be a crime i feel like if we didn't do something on this trip with a shape charge", "It'd be a crime, I feel like, if we didn't do something on this trip with a shape charge."),
 ("it is a crime", "It is a crime."),
 ("we've done them every single time we've been here", "We've done them every single time we've been here."),
 ("mhm", "Mhm."), ("here's one", "Here's one."), ("what", "What?"),
 ("here's another", "Here's another."), ("i like him", "I like him."),
 ("another", "Another."), ("there's another", "There's another."),
 ("there you go", "There you go."), ("whoa", "Whoa!"), ("wow", "Wow!"),
 ("every time say follow we done it we've only done it with one charge", "Every time say follow we done it, we've only done it with one charge."),
 ("so i thought this time how about we get two charges and point them at at each other make them fight", "So I thought this time, how about we get two charges and point them at at each other, make them fight?"),
 ("fight", "Fight!"),
 ("for those who haven't seen a shape charge video what's a shape charge dan", "For those who haven't seen a shape charge video, what's a shape charge, Dan?"),
 ("it's a an explosive where you start the explosion here and there's some explosives packed behind this focusing copper liner", "It's a an explosive where you start the explosion here, and there's some explosives packed behind this focusing copper liner."),
 ("what it does is it causes from the rear the focused jet to appear", "What it does is it causes from the rear the focused jet to appear."),
 ("it kind of inverts the cone and these are used for making holes in things like steel or earth or concrete or rock or tanks or whatever really", "It kind of inverts the cone, and these are used for making holes in things like steel or Earth or concrete or rock or tanks or whatever, really."),
 ("and that's done just entirely from the shape that it starts at", "And that's done just entirely from the shape that it starts at."),
 ("correct", "Correct."),
 ("as always these events are incredibly fast", "As always, these events are incredibly fast."),
 ("we've got some serious gear again", "We've got some serious gear again."),
]

def normalized(text):
    return re.sub(r"[^\w']", '', text.lower().replace('’', "'"))

def reviewed_boundaries(words,start):
    """Match the complete AI-authored boundary plan; never silently apply a prefix."""
    tokens=[normalized(w['text']) for w in words];cursor=start;plan=[]
    for line in Path(__file__).with_name('sentence_endings.txt').read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'): continue
        suffix,punctuation=line.rsplit('|',1);expected=[normalized(t) for t in suffix.split()]
        found=next((i+len(expected) for i in range(cursor,len(tokens)-len(expected)+1) if tokens[i:i+len(expected)]==expected),None)
        if found is None: raise ValueError(f'Unmatched sentence ending after word {cursor}: {suffix}')
        if found-cursor>120: raise ValueError(f'Unexpectedly long sentence before: {suffix}')
        plan.append((found,punctuation));cursor=found
    if cursor!=len(words): raise ValueError(f'Uncovered transcript tail: {len(words)-cursor} words')
    return plan

def track_for(clips):
    tracks=defaultdict(list)
    for c in clips: tracks[c.get('provenance','unknown')].append(c)
    # Prefer the supplied complete track; never interleave independent transcriptions.
    key=next((k for k in ('youtube-manual','user-xlsx','youtube-auto') if k in tracks),next(iter(tracks)))
    return sorted(tracks[key],key=lambda c:c['start'])

def sentence_view(clips,provided_rows=None):
    sources=defaultdict(list)
    for c in clips: sources[c['sourceId']].append(c)
    result=[]
    for source,all_clips in sources.items():
        track=track_for(all_clips)
        rows=provided_rows if source=='UVnck7nWaB4' and track[0].get('provenance')=='user-xlsx' and provided_rows else [dict(start=c['start'],duration=c['end']-c['start'],text=c['text']) for c in track]
        words=[]
        for i,row in enumerate(rows):
            tokens=row['text'].split()
            if not tokens: continue
            start=float(row['start']);end=start+float(row['duration'])
            if i+1<len(rows): end=min(end,float(rows[i+1]['start']))
            if end<=start: continue
            weights=[max(2,len(normalized(t))) for t in tokens];total=sum(weights);offset=0
            for text,weight in zip(tokens,weights):
                a=start+(end-start)*offset/total;offset+=weight
                words.append(dict(text=text,start=a,end=start+(end-start)*offset/total))
        cursor=0;sequence=0
        def emit(last,text,status):
            nonlocal cursor,sequence
            span=[dict(w) for w in words[cursor:last]]
            displayed=text.split()
            if len(displayed)==len(span):
                for word,token in zip(span,displayed): word['text']=token
            else: span[-1]['text']=span[-1]['text'].rstrip('.!?')+'.'
            owner=next((c for c in track if c['start']<=span[0]['start']<c['end']),track[-1])
            result.append({**owner,'id':f'{source}:sentence-v1:{round(span[0]["start"]*1000)}', 'text':text,'start':span[0]['start'],'end':span[-1]['end'],
                           'words':span,'sentenceStatus':status,'originalExerciseId':owner['id']})
            cursor=last;sequence+=1
        if source=='UVnck7nWaB4':
            for original,edited in OPENING:
                expected=original.split();count=len(expected)
                if [normalized(w['text']) for w in words[cursor:cursor+count]]!=[normalized(t) for t in expected]: break
                emit(cursor+count,edited,'edited')
            if cursor and cursor<len(words):
                try: plan=reviewed_boundaries(words,cursor)
                except ValueError: plan=[]
                for last,punctuation in plan:
                    text=' '.join(w['text'] for w in words[cursor:last])
                    text=text[0].upper()+text[1:]
                    emit(last,text.rstrip('.!?')+punctuation,'ai-reviewed')
        while cursor<len(words):
            end=cursor;status='candidate'
            while end<len(words):
                end+=1
                if re.search(r'[.!?]["\)]*$',words[end-1]['text']) and not re.match(r'^(Mr|Mrs|Dr|Prof|etc)\.$',words[end-1]['text'],re.I):
                    status='original';break
                # Unprepared tracks remain subtitle cues, never fabricated sentences.
                if end<len(words) and any(abs(words[end]['start']-float(r['start']))<.0001 for r in rows): break
            text=' '.join(w['text'] for w in words[cursor:end])
            emit(end,text,status)
    return result
