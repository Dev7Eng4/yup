export const updateContentOutro = text =>
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
