export const checkFirstParagraph = (title, content) => `
Bạn là một biên dịch viên và chuyên gia ngôn ngữ tiếng Nhật. Dưới đây là một đoạn trích từ file phụ đề (SRT) tiếng Nhật được tạo ra từ phần mềm nhận diện giọng nói.

Ngữ cảnh của video: Video này có tiêu đề là '${title}'.

Yêu cầu:

1. Đọc nối các dòng text với nhau để hiểu trọn vẹn ngữ cảnh.

2. Dựa vào tiêu đề và ngữ cảnh trên, sửa lại các lỗi chính tả, ngữ pháp, lỗi nhận diện sai âm thanh (đặc biệt chú ý từ đồng âm Kanji) để văn bản trở nên tự nhiên, đúng chuẩn tiếng Nhật.

3. Giữ nguyên tuyệt đối định dạng SRT (số thứ tự, mốc thời gian) và phân bổ lại text sao cho hợp lý.

4. Liệt kê ngắn gọn ở cuối cùng những từ bạn đã sửa.

Đây là đoạn SRT:
${content}
`;

export const checkLastParagraph = (title, content, part) => `
Đây là phần tiếp theo (Phần ${part}) của file phụ đề SRT cho video '${title}'.

Yêu cầu:
Hãy tiếp tục áp dụng chính xác các quy tắc như phần trước:

1. Sửa lỗi chính tả, ngữ pháp, lỗi nghe nhầm (đặc biệt chú ý từ đồng âm Kanji) dựa theo ngữ cảnh xuyên suốt của video.

2. Giữ nguyên định dạng SRT (số thứ tự, mốc thời gian).

3. Liệt kê các từ đã sửa ở cuối.

4. Lưu ý quan trọng: Dòng đầu tiên của phần này có thể là đoạn nối tiếp của câu cuối cùng ở phần trước, hãy chú ý ghép nối để hiểu đúng nghĩa trước khi sửa.

Đây là đoạn SRT tiếp theo:
${content}
`;
