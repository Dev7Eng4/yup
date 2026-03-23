const testSrt = () => {
  const blocks = [
    '00:10:02.079 --> 00:10:06.230 \nご視聴いただきありがとうございまし',
    '00:10:06.230 --> 00:10:06.240 \nご視聴いただきありがとうございまし',
    '00:10:06.240 --> 00:10:10.190 \nご視聴いただきありがとうございまし\nた次回作も頑張りますのでまたご覧',
    '00:10:10.190 --> 00:10:10.200 \nた次回作も頑張りますのでまたご覧',
    '00:10:10.200 --> 00:10:13.870 \nた次回作も頑張りますのでまたご覧\nいただけますと幸いでござい',
    '00:10:13.870 --> 00:10:13.880 \nいただけますと幸いでござい',
    '00:10:13.880 --> 00:10:17.430 \nいただけますと幸いでござい\nますチャンネル登録いいねもよろしくお',
    '00:10:17.430 --> 00:10:17.440 \nますチャンネル登録いいねもよろしくお',
    '00:10:17.440 --> 00:10:21.150 \nますチャンネル登録いいねもよろしくお\n願いいたし',
    '00:10:21.150 --> 00:10:21.160 \n',
    '00:10:21.160 --> 00:10:24.160 \nます',
  ];

  const cleaned = [];
  let prevLine = '';
  const strBreak = '<break>';

  for (const block of blocks) {
    console.log('🚀 ~ testSrt ~ block:', block);
    // Tách timestamp + text
    const [timeLine, ...lines] = block
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    console.log('🚀 ~ testSrt ~ lines:', lines);
    console.log('🚀 ~ testSrt ~ timeLine:', timeLine);
    console.log('🚀 ~ testSrt ~ prevLine:', prevLine);
    if (!timeLine || !timeLine.includes('-->')) continue;

    const subtitleText = lines.join(' ').replace(/\s+/g, ' ').trim();
    const checkedText = lines.join(strBreak).replace(/\s+/g, ' ').trim();
    console.log('🚀 ~ testSrt ~ subtitleText:', subtitleText);

    // Bỏ qua nếu lặp
    // if (!prevLine || (!prevLine.includes(subtitleText) && !subtitleText.includes(prevLine))) {
    if (!prevLine || prevLine.split(strBreak)[0] !== lines[0]) {
      // lấy start / end thô để xử lý sau
      const parts = timeLine.split('-->').map(p => p.trim());
      const rawStart = parts[0];
      const rawEnd = parts[1];
      cleaned.push({ rawStart, rawEnd, text: subtitleText });
      prevLine = checkedText;
    }
  }
};

testSrt();
