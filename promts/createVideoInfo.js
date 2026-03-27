export const createTitleVideo = (title, content) =>
  `
Bạn là chuyên gia viết tiêu đề YouTube cho thị trường Nhật Bản, với mục tiêu tối đa hóa CTR.

Nhiệm vụ:
- Viết lại tiêu đề video bằng TIẾNG NHẬT.
- Giữ đúng nội dung video (không bịa, không gây hiểu sai).
- Ưu tiên CTR hơn SEO.

Chiến lược:
- Có thể sử dụng định dạng 【】 ở đầu để xác định nội dung (anime, 2ch, 解説, 考察…).
- Phần sau 【】 phải là câu hook gây tò mò mạnh.
- Hook phải xuất hiện ở nửa đầu tiêu đề.
- Tạo “curiosity gap” (gợi mở nhưng không nói hết).
- Không được tiết lộ kết luận chính hoặc toàn bộ nội dung (tránh spoiler).
- Có yếu tố bất ngờ, twist hoặc “違和感”.
- Khiến người xem nghĩ: 「気になる…」 và muốn click ngay.

Phong cách:
- Tự nhiên như người Nhật (native).
- Có thể dùng: 「…」「？」 để tăng tò mò.
- Ưu tiên các dạng:
  「実は〜」「なぜ〜？」「知らない事実」「〜と思ってたけど…」「これヤバい」

Yêu cầu:
- Chỉ viết DUY NHẤT 1 title.
- Không giải thích, không ký tự thừa.
- Độ dài ~40–65 ký tự.
- Không spam keyword, không SEO cứng.

Dữ liệu:
Title gốc: ${title}
${content ? `Transcript: ${content}` : ''}

FORMAT BẮT BUỘC:
- Trả về kết quả trong code block
- Trong code block CHỈ chứa duy nhất 1 dòng title tiếng Nhật

Ví dụ format đúng:
【修羅場】夫の一言に違和感…調べた結果がヤバすぎた…
- Không thêm bất kỳ text nào ngoài code block

Yêu cầu cuối:
- Chỉ trả về code block chứa title。
`;

export const createDescriptionVideo = (title, description) => `
Bạn là chuyên gia SEO YouTube tại thị trường Nhật Bản.

Nhiệm vụ:

* Viết lại (rewrite) phần description video bằng TIẾNG NHẬT.
* Tối ưu SEO theo hành vi tìm kiếm của người Nhật.
* Tăng CTR (gây tò mò, hấp dẫn, giữ chân người xem).
* Giữ đúng nội dung video, KHÔNG bịa thêm tình tiết.

Dữ liệu đầu vào:

* Title: ${title}
* Description gốc: ${description}

Yêu cầu xử lý:

1. Loại bỏ:

   * Thông tin không liên quan (link cũ, credit không cần thiết, CTA không hiệu quả, spam keyword).
   * Những phần không thể reuse cho video mới.

2. Giữ lại & tối ưu:

   * Những đoạn mô tả nội dung chính.
   * Từ khóa quan trọng (SEO keyword).
   * Các cụm từ đang có hiệu suất tốt (nếu có).

3. Viết lại description theo cấu trúc:

   * Dòng đầu: hashtag SEO (3–5 hashtag mạnh nhất, liên quan trực tiếp nội dung).
   * 2–3 dòng đầu: hook cực mạnh để tăng CTR.
   * Phần thân:

     * Tóm tắt nội dung rõ ràng, dễ đọc
     * Chèn từ khóa tự nhiên (không nhồi nhét)
   * CTA nhẹ (khuyến khích xem tiếp / đăng ký kênh)
   * Cuối cùng: thêm 5–10 hashtag liên quan (bao gồm từ khóa chính + biến thể)

4. Phong cách:

   * Tự nhiên như người Nhật viết
   * Không quá dài dòng
   * Ưu tiên readability + giữ chân người xem

5. Tuyệt đối KHÔNG:

   * Nhồi keyword spam
   * Viết sai nội dung video
   * Dùng văn phong máy móc

6. FORMAT BẮT BUỘC:

   * Trả về kết quả trong code block
   * Trong code block là TOÀN BỘ description tiếng Nhật hoàn chỉnh
   * Giữ xuống dòng hợp lý để dễ đọc

Ví dụ format đúng:

#修羅場 #浮気 #離婚

妻のある一言に違和感を覚えた俺…
調べてみた結果、想像を超える事実が発覚した——

（phần nội dung tiếp tục…）

   * Không thêm bất kỳ text nào ngoài code block

Yêu cầu cuối:

   * Chỉ trả về code block chứa description。

`;

export const createTagsVideo = (title, tags) => `
Bạn là chuyên gia SEO YouTube tại thị trường Nhật Bản.

Nhiệm vụ:

* Tối ưu và mở rộng tags cho video dựa trên:

  * Title
  * Tags cũ

Mục tiêu:

* Giữ lại những tags cũ có giá trị SEO cao
* Loại bỏ tags yếu / không liên quan
* Thêm tags mới để mở rộng khả năng tìm kiếm và đề xuất

Dữ liệu đầu vào:

* Title: ${title}
* Tags cũ: ${tags}

Yêu cầu xử lý:

1. Phân tích tags cũ:

   * Xác định tag nào:

     * Liên quan mạnh đến nội dung → GIỮ
     * Có tiềm năng SEO → GIỮ
     * Không liên quan / quá chung / spam → LOẠI BỎ

2. Tạo tags mới:

   * Tag ngắn (1–2 từ)
   * Tag trung bình (2–3 từ)
   * Tag dài (long-tail 4–8 từ)
   * Biến thể từ khóa
   * Tag theo ngữ cảnh (修羅場, スカッと, 浮気, 離婚, 2ch など)

3. BẮT BUỘC:

   * Thêm 5–10 tag cực dài
   * Dạng câu tìm kiếm tự nhiên của người Nhật
   * Ví dụ: 「浮気した夫に復讐した結果」「離婚後に起きた衝撃の展開」

4. Chiến lược:

   * Ưu tiên hành vi tìm kiếm thật của người Nhật
   * Không nhồi nhét keyword
   * Không trùng lặp tag (dù là tag cũ hay mới)
   * Bao phủ cả:

     * Search intent
     * Browse / đề xuất

5. Output:

   * 30–50 tags tổng cộng (bao gồm cả tag cũ đã được giữ lại + tag mới)
   * Viết bằng tiếng Nhật
   * Phân cách bằng dấu phẩy (,)

6. FORMAT BẮT BUỘC:

   * Trả về kết quả trong code block
   * Trong code block CHỈ có 1 dòng duy nhất chứa toàn bộ tags
   * Không xuống dòng trong code block

Ví dụ format đúng:

修羅場, 浮気, 離婚, スカッと, 2ch, 不倫された夫の逆襲, 妻の裏切りの結末, 離婚後に起きた衝撃の展開

   * Không thêm bất kỳ text nào ngoài code block

Yêu cầu cuối:

   * Chỉ trả về code block chứa tag.
`;
