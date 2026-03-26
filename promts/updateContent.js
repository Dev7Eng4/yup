export const checkContentSrt = content => `
Role: Bạn là một chuyên gia hiệu đính (Proofreader) tiếng Nhật bản ngữ, chuyên xử lý lỗi nhận diện giọng nói (Speech-to-Text).

Task: Tôi có một đoạn file .srt tiếng Nhật được YouTube tạo tự động. Tôi cần bạn sửa lại các lỗi sai do máy tính nghe nhầm hoặc chuyển đổi Kanji sai.

BẮT BUỘC TUÂN THỦ CÁC QUY TẮC SAU:

KHÔNG THAY ĐỔI VĂN PHONG: Giữ nguyên cấu trúc câu, từ ngữ, trợ từ và cách xưng hô của người nói. Dù câu nói có lủng củng hay là khẩu ngữ, tuyệt đối không được "trau chuốt" lại cho hay hơn.

CHỈ SỬA LỖI SAI (Correction only): Chỉ sửa những từ bị AI nhận diện sai âm thanh hoặc sai chữ Kanji (ví dụ: nghe nhầm từ đồng âm nhưng khác nghĩa dựa trên ngữ cảnh).

GIỮ NGUYÊN TIMESTAMPS: Tuyệt đối không thay đổi các mốc thời gian (ví dụ: 00:00:01,000 --> 00:00:03,000).

GIỮ NGUYÊN ĐỊNH DẠNG SRT: Đầu ra phải là định dạng SRT chuẩn, chỉ chứa tiếng Nhật đã được sửa. Không thêm bất kỳ lời giải thích nào.

ĐỊNH DẠNG OUTPUT:
- Toàn bộ kết quả phải nằm trong DUY NHẤT 1 code block.
- Không có bất kỳ nội dung nào nằm ngoài code block.
- Không thêm giải thích, không thêm ký tự thừa.

Mục tiêu chính: Sửa đúng mặt chữ dựa trên ngữ cảnh toàn đoạn để nội dung chính xác với những gì người trong video đang nói.

Nội dung cần xử lý:
${content}
`;

export const updateTranscriptSrt = (title, content, part) =>
  `
Bạn là chuyên gia chỉnh sửa phụ đề, một chuyên gia hiệu đính (Proofreader) tiếng Nhật bản ngữ, chuyên xử lý lỗi nhận diện giọng nói (Speech-to-Text).

Tôi sẽ cung cấp một phần của file .srt (đã bị chia nhỏ). Hãy:

1. Giữ nguyên cấu trúc .srt:
   - Không đổi số thứ tự
   - Không đổi timestamp
   - Không gộp/tách dòng

2. Chỉ sửa nội dung:
   - Sửa chính tả, ngữ pháp
   - Thêm dấu câu hợp lý
   - Viết hoa đúng
   - Giữ nguyên ý nghĩa

3. Đảm bảo:
   - Văn phong nhất quán
   - Thuật ngữ dùng thống nhất
   - Tự nhiên như lời nói

4. KHÔNG thêm giải thích

5. QUAN TRỌNG:
   - Trả về kết quả trong một code block duy nhất
   - Không viết gì ngoài code block

Ngữ cảnh chung:
- Tiêu đề video: ${title}

Đây là phần [${part}]:

${content}
`;

export const updateOutroTranscript = text =>
  `Hãy đóng vai trò là một chuyên gia ngôn ngữ tiếng Nhật và xử lý dữ liệu.
Dưới đây là một đoạn phụ đề (SRT) tiếng Nhật. Các câu đang bị cắt vụn một cách thiếu tự nhiên, ngắt quãng giữa các từ hoặc các hạt (trợ từ) do giới hạn thời gian hiển thị.
Nhiệm vụ của bạn là:

Loại bỏ nhiễu: Bỏ qua toàn bộ số thứ tự và mốc thời gian (timecode). Chỉ giữ lại phần văn bản (text).
Ghép nối chính xác: Nối các đoạn text lại với nhau một cách liền mạch, sửa các lỗi ngắt từ sai ngữ pháp (ví dụ: "まし" ở dòng trước ghép với "た" ở dòng sau phải thành "ました").
Phân tách câu: Phân tích ngữ nghĩa để chia lại thành các câu hoàn chỉnh dựa trên đuôi câu tiếng Nhật (như ました, ます, です, v.v.).
Định dạng đầu ra: Thêm dấu chấm câu tiếng Nhật (。) vào cuối mỗi câu. Mỗi câu hoàn chỉnh phải được đặt trên một dòng riêng biệt để dễ đọc.
Kết quả: Trả ra sau text "Kết quả bạn mong muốn:"

Đoạn SRT cần xử lý: 
${text}`;
