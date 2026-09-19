"""Authored practice content. Not quotes from the user's video."""
GOALS = {
    'polarity': '긍정·부정 구분', 'scope': '부정의 범위와 확실성',
    'pattern': '문장 구조 따라가기', 'numbers': '숫자와 단위', 'context': '설명의 흐름',
}

def item(id, text, goal, prompt, options, answer, explanation, pattern, meaning):
    return dict(id=id, sourceId='practice', kind='speech', text=text, goal=goal,
                prompt=prompt, options=options, answer=answer, explanation=explanation,
                pattern=pattern, meaning=meaning, quality='authored', version=1, start=0, end=0)

EXERCISES = [
 item('p01','The device passed the test.','polarity','테스트 결과는 어떤가요?', ['통과했어요','통과하지 못했어요','결과를 말하지 않았어요'],0,'passed는 통과했다는 뜻입니다.','결과 확인','장치가 테스트를 통과했습니다.'),
 item('p02',"The device didn't pass the test.",'polarity','테스트 결과는 어떤가요?', ['통과했어요','통과하지 못했어요','결과를 말하지 않았어요'],1,"didn't pass는 통과하지 못했다는 뜻입니다.",'결과 확인','장치가 테스트를 통과하지 못했습니다.'),
 item('p03',"The device didn't fail during the test, but the leakage current increased.",'polarity','두 가지 관찰을 연결해 보세요.', ['실패했고 누설 전류가 증가했어요','실패하지 않았고 누설 전류가 감소했어요','실패하지 않았지만 누설 전류가 증가했어요'],2,'실패하지 않았다는 설명과 전류가 증가했다는 설명을 함께 유지해 보세요.','부정 + 관찰','테스트 중 장치는 실패하지 않았지만 누설 전류는 증가했습니다.'),
 item('p04',"We haven't confirmed the cause yet.",'scope','원인의 확인 상태는 어떤가요?', ['원인이 확인됐어요','아직 원인을 확인하지 못했어요','원인이 없다고 확인됐어요'],1,"haven't … yet은 아직 확인하지 못한 상태입니다. 원인이 없다는 뜻은 아닙니다.",'아직 확인되지 않음','아직 원인을 확인하지 못했습니다.'),
 item('p05',"Not all devices failed.",'scope','이 설명으로 알 수 있는 것은 무엇인가요?', ['모든 장치가 실패했어요','정확히 절반이 실패했어요','모든 장치가 실패한 것은 아니에요'],2,'not all은 전부 그렇지는 않다는 뜻입니다. 정확한 실패 수는 알 수 없습니다.','부정의 범위','모든 장치가 실패한 것은 아닙니다.'),
 item('p06','We confirmed that the contact was damaged.','scope','확인된 내용은 무엇인가요?', ['접촉부 손상이 확인됐어요','접촉부 손상은 가능성일 뿐이에요','접촉부에는 손상이 없어요'],0,'confirmed는 확인했다는 의미입니다.','확인과 추측','접촉부가 손상된 것을 확인했습니다.'),
 item('p07','The failure may be caused by a damaged contact.','scope','원인에 대해 얼마나 확실하게 말하나요?', ['손상이 원인이라고 확정했어요','접촉부 손상일 가능성을 말해요','접촉부 손상을 배제했어요'],1,'may be caused by는 원인일 가능성을 제시합니다.','확인과 추측','접촉부 손상이 불량의 원인일 수 있습니다.'),
 item('p08','We used a microscope to inspect the surface.','pattern','무엇을 위해 현미경을 사용했나요?', ['표면을 가열하려고','전류를 측정하려고','표면을 검사하려고'],2,'used a microscope / to inspect the surface: 수단 다음에 목적이 나옵니다.','We used X to Y','표면을 검사하려고 현미경을 사용했습니다.'),
 item('p09','We used a laser to align the parts.','pattern','레이저를 사용한 목적은 무엇인가요?', ['부품을 정렬하려고','부품을 냉각하려고','표면을 검사하려고'],0,'to align the parts는 부품을 정렬하려는 목적입니다.','We used X to Y','부품을 정렬하려고 레이저를 사용했습니다.'),
 item('p10',"We didn't expect the current to rise so quickly.",'pattern','예상하지 못했던 것은 무엇인가요?', ['전류가 빠르게 감소하는 것','전류가 빠르게 증가하는 것','테스트가 시작되는 것'],1,"didn't expect 뒤에서 예상하지 못한 변화가 이어집니다.",'We didn’t expect X to Y','전류가 그렇게 빨리 증가할 줄은 예상하지 못했습니다.'),
 item('p11','Keep the temperature as stable as possible.','pattern','온도를 어떻게 하라는 뜻인가요?', ['최대한 높게 유지해요','가능하면 측정을 생략해요','최대한 안정적으로 유지해요'],2,'as stable as possible은 최대한 안정적으로라는 뜻입니다.','as … as possible','온도를 최대한 안정적으로 유지하세요.'),
 item('p12','The leakage current increases when the temperature rises.','pattern','언제 누설 전류가 증가하나요?', ['온도가 올라갈 때','온도가 내려갈 때','전류가 일정할 때'],0,'when 뒤의 온도 상승이 앞의 변화가 일어나는 조건입니다.','X increases when Y','온도가 올라가면 누설 전류가 증가합니다.'),
 item('p13','We tested twenty samples at eighty degrees Celsius.','numbers','샘플 수와 온도를 연결해 보세요.', ['80개, 섭씨 20도','20개, 섭씨 80도','20개, 섭씨 18도'],1,'twenty samples와 eighty degrees Celsius를 각각 대상과 연결하세요.','수치 + 대상','섭씨 80도에서 샘플 20개를 테스트했습니다.'),
 item('p14','The leakage current increased from two to five microamps.','numbers','전류가 어떻게 변했나요?', ['5에서 2 마이크로암페어로 감소','2에서 5 밀리암페어로 증가','2에서 5 마이크로암페어로 증가'],2,'from two to five가 변화 방향, microamps가 단위입니다.','from X to Y','누설 전류가 2에서 5 마이크로암페어로 증가했습니다.'),
 item('p15',"The sample passed at room temperature, but it didn't pass at eighty degrees Celsius.",'polarity','온도에 따른 결과는 어떤가요?', ['실온에서 통과, 80도에서 미통과','실온에서 미통과, 80도에서 통과','두 온도에서 모두 통과'],0,'but 이후의 부정은 80도 조건에 적용됩니다.','조건별 긍정·부정','실온에서는 통과했지만 섭씨 80도에서는 통과하지 못했습니다.'),
]

BASELINE = {
 'date':'2026-09-19','reviewDate':'2026-10-19',
 'summary':'글로 이해하는 표현도 첫 청취에서는 놓치며, 일부 단어와 요지는 잡지만 설명 전체를 안정적으로 연결하기 어렵습니다.',
 'observations':[
  '4K는 해상도와 연결했지만 1,000 frames a second는 듣고 놓쳤고, 글로는 이해했습니다.',
  '문구 확인 후 the hole of entry와 stretches out massively가 선명하게 들렸습니다.',
  'I was not expecting …은 문구 확인과 감속 후에도 일부만 구분했습니다.',
  '긍정·부정의 소리와 긴 문장의 부정 의미 유지 모두 어렵다는 자기보고가 있습니다.'
 ],'note':'대화 기반 정성 기록입니다. CEFR 등급이나 객관적 정답률을 추정하지 않았습니다.'}
