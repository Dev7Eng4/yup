export const checkFirstParagraph = (title, content) => `
Role: Bạn là một chuyên gia ngôn ngữ tiếng Nhật và biên tập viên phụ đề chuyên nghiệp, có kinh nghiệm xử lý dữ liệu từ phần mềm nhận diện giọng nói (ASR).

Dữ liệu đầu vào:
- Tiêu đề video: ${title}
- Nội dung phụ đề gốc (SRT): ${content}

Quy trình xử lý:

1. Phân tích ngữ cảnh: Dựa vào tiêu đề video, hãy xác định chủ đề (hàn lâm, đời thường, kịch tính, hay tin tức) để lựa chọn từ vựng và Kanji phù hợp nhất.

2. Hợp nhất & Chỉnh sửa (Merge & Correct):

- Gộp dòng: Nối các dòng bị ngắt quãng vô lý thành câu hoàn chỉnh và dễ hiểu.
- Sửa lỗi ASR: Đặc biệt chú ý sửa các lỗi đồng âm (Homonyms) do AI nghe nhầm, các từ Kanji sai ngữ cảnh, và nối lại các từ bị xẻ đôi giữa các dòng.

3. Logic mốc thời gian (Timestamp):

- Khi gộp nhiều dòng thành một, mốc thời gian mới phải là: [Thời gian bắt đầu của dòng đầu tiên] --> [Thời gian kết thúc của dòng cuối cùng].
- Đảm bảo các mốc thời gian không bị chồng lấn và phụ đề xuất hiện liên tục, mượt mà.

4. Định dạng đầu ra:

- Trả về file SRT chuẩn, đánh số thứ tự (Index) bắt đầu từ 1.
- Mỗi dòng phụ đề không nên quá dài (ưu tiên ngắt ở các dấu phẩy/trợ từ nếu câu dài trên 40 ký tự).
`;

export const checkLastParagraph = (title, content) => `
Role: Tiếp tục vai trò chuyên gia hiệu đính phụ đề cho video: ${title}.

Nhiệm vụ tiếp nối:
Hãy xử lý đoạn SRT dưới đây, đảm bảo tính liên kết chặt chẽ với phần chúng ta vừa thực hiện ở ngay phía trên:

1. Số thứ tự (Index): Hãy tự động kiểm tra số thứ tự cuối cùng của kết quả ở lượt chat trước và bắt đầu đoạn này bằng số tiếp theo (Index + 1).

2. Tính liên tục: Đảm bảo mạch văn, cách xưng hô của nhân vật và cách dùng từ Kanji đồng nhất với nội dung vừa xử lý.

3. Hợp nhất & Chỉnh sửa (Merge & Correct):
- Gộp dòng: Nối các dòng vụn thành câu hoàn chỉnh, tự nhiên.
- Sửa lỗi ASR: Sửa các lỗi đồng âm Kanji, lỗi ngữ pháp dựa trên tiêu đề và ngữ cảnh phim.

4. Logic mốc thời gian (Timestamp):
- Hợp nhất thời gian: [Bắt đầu dòng đầu] --> [Kết thúc dòng cuối] của cụm được gộp.
- Đảm bảo thời gian không chồng chéo.

5. Định dạng đầu ra: Trả về file SRT chuẩn, mỗi dòng không quá 40 ký tự.

6. Báo cáo: Liệt kê bảng các từ quan trọng đã sửa trong đoạn này.

Dữ liệu SRT đầu vào (Phần tiếp theo):
${content}
`;

export const checkContentSrt = (content) => `
Role: Bạn là một chuyên gia hiệu đính (Proofreader) tiếng Nhật bản ngữ, chuyên xử lý lỗi nhận diện giọng nói (Speech-to-Text).

Task: Tôi có một đoạn file .srt tiếng Nhật được YouTube tạo tự động. Tôi cần bạn sửa lại các lỗi sai do máy tính nghe nhầm hoặc chuyển đổi Kanji sai.

BẮT BUỘC TUÂN THỦ CÁC QUY TẮC SAU:

KHÔNG THAY ĐỔI VĂN PHONG: Giữ nguyên cấu trúc câu, từ ngữ, trợ từ và cách xưng hô của người nói. Dù câu nói có lủng củng hay là khẩu ngữ, tuyệt đối không được "trau chuốt" lại cho hay hơn.

CHỈ SỬA LỖI SAI (Correction only): Chỉ sửa những từ bị AI nhận diện sai âm thanh hoặc sai chữ Kanji (ví dụ: nghe nhầm từ đồng âm nhưng khác nghĩa dựa trên ngữ cảnh).

GIỮ NGUYÊN TIMESTAMPS: Tuyệt đối không thay đổi các mốc thời gian (ví dụ: 00:00:01,000 --> 00:00:03,000).

GIỮ NGUYÊN ĐỊNH DẠNG SRT: Đầu ra phải là định dạng SRT chuẩn, chỉ chứa tiếng Nhật đã được sửa. Không thêm bất kỳ lời giải thích nào.

Mục tiêu chính: Sửa đúng mặt chữ dựa trên ngữ cảnh toàn đoạn để nội dung chính xác với những gì người trong video đang nói.

Nội dung cần xử lý:
${content}
`