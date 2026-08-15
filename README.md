# 🚪 Cửa cuốn — Thông báo & Nhật ký đóng/mở (Home Assistant / HACS)

Tích hợp Home Assistant cho **cửa cuốn**: theo dõi cảm biến đóng/mở gắn trên cửa (cảm biến contact
Zigbee/Tuya ghép qua Smart Life, hoặc entity `cover`), rồi:

- **Gửi thông báo** về điện thoại mỗi lần cửa **MỞ** và mỗi lần cửa **ĐÓNG**
  (thông báo lúc đóng có kèm **cửa vừa mở trong bao lâu**).
- **Cảnh báo cửa mở quá lâu** (mặc định 15 phút) và **nhắc lại** tới khi đóng.
- **Màn hình "Cửa cuốn"** trên sidebar: trạng thái hiện tại (đang mở bao lâu — đếm trực tiếp),
  thống kê hôm nay, và **nhật ký từng lượt**: giờ mở → giờ đóng, thời lượng, gom nhóm theo ngày.
- **Bấm vào thông báo** → mở thẳng màn hình "Cửa cuốn" trong app HA.

Nhật ký lưu ở **server** (`.storage`) nên xem trên máy nào / điện thoại nào cũng giống nhau, và
không mất khi khởi động lại HA.

## Cài đặt (qua HACS — khuyên dùng)
1. HACS → menu **⋮** → **Custom repositories** → thêm URL repo này, category **Integration**.
2. Tìm **"Cửa cuốn"** → **Download**.
3. **Khởi động lại Home Assistant**.
4. **Settings → Devices & Services → Add Integration** → tìm **"Cửa cuốn"**.
5. Chọn:
   - **Cảm biến cửa**: entity của cảm biến đóng/mở (vd `binary_sensor.cam_bien_cua_cuon`).
   - **Dịch vụ thông báo**: `notify.mobile_app_<điện_thoại>`.
   - **Đảo trạng thái**: bật nếu cảm biến báo ngược (cửa đóng lại hiện "Mở").
   - **Cảnh báo khi mở quá**: số phút (mặc định 15, đặt `0` để tắt).
6. Xong! Mục **"Cửa cuốn"** xuất hiện trên sidebar.

## Cấu hình thêm (Configure)
**Settings → Devices & Services → Cửa cuốn → Configure**:

| Tùy chọn | Mặc định | Ý nghĩa |
|---|---|---|
| Cảm biến cửa | — | Đổi entity theo dõi |
| Dịch vụ thông báo | — | Đổi điện thoại nhận thông báo |
| Đảo trạng thái | tắt | Dùng khi cảm biến báo ngược |
| Cảnh báo khi mở quá | 15 phút | `0` = tắt cảnh báo mở lâu |
| Nhắc lại mỗi | 5 phút | `0` = chỉ nhắc 1 lần |
| Chống rung | 3 giây | Trạng thái phải giữ đủ số giây này mới tính (lọc rung nhiễu do cửa kim loại) |
| Nội dung khi MỞ / ĐÓNG / mở quá lâu | xem dưới | Tự sửa lời thông báo |

**Biến dùng được trong nội dung thông báo:**
`{time}` (giờ `HH:MM`), `{date}` (ngày `dd/mm/yyyy`), `{duration}` (thời gian cửa đã mở).

Mặc định:
```
MỞ        : 🔓 Cửa cuốn vừa MỞ lúc {time}
ĐÓNG      : 🔒 Cửa cuốn đã ĐÓNG lúc {time} · mở trong {duration}
Mở quá lâu: ⏰ Cửa cuốn đã mở {duration} mà chưa đóng!
```

## Cách hoạt động
- Lắng nghe entity cảm biến; quy đổi trạng thái: `off`/`closed` = **đóng**, `on`/`open`/`opening`/
  `closing` = **mở**. `unknown`/`unavailable` → **bỏ qua** (không coi là đóng, tránh báo nhầm khi
  cảm biến mất kết nối).
- **Chống rung:** trạng thái mới phải giữ liên tục đủ N giây mới được ghi nhận → cửa cuốn kim loại
  làm cảm biến nhấp nháy sẽ không sinh ra hàng chục thông báo.
- Mỗi lần mở tạo một **"lượt mở"** trong nhật ký; khi đóng thì chốt lại và tính **thời lượng**.
- **Khởi động lại HA:** đọc `last_changed` của cảm biến để vá lượt mở/đóng đã xảy ra lúc HA tắt
  (không gửi thông báo cho các sự kiện quá khứ này). Cửa đang mở thì hẹn lại cảnh báo mở-quá-lâu.
- Thông báo dùng chung một `tag` → thông báo mới **thay** thông báo cũ trên điện thoại, nhắc lại
  nhiều lần cũng không dồn đống.
- Panel đọc nhật ký qua WebSocket `cua_cuon/get_log`; nút **Xóa lịch sử** gọi `cua_cuon/clear_log`
  (nếu cửa đang mở thì giữ lại lượt đang mở để vẫn tính đúng thời lượng).
- Nhật ký giữ **500 lượt gần nhất**.

## Không thấy log / không có thông báo? (chẩn đoán)

Panel có sẵn thẻ **📡 Cảm biến** hiển thị *"HA nhận tin lần cuối lúc mấy giờ"*. So mốc đó với log
trong app SmartLife:

| Hiện tượng | Nghĩa là | Cách xử lý |
|---|---|---|
| Mốc trong panel **cũ hơn** log SmartLife | **Sự kiện không vào tới HA** — cảm biến & hub vẫn tốt, nhưng tích hợp đưa cảm biến vào HA (Matter/Zemismart M6 hoặc Tuya cloud) đã ngừng đẩy | Settings → Devices & Services → tích hợp đó → **Reload**. Nếu tái diễn: đổi sang đường vào khác (Matter ↔ Tuya cloud) hoặc dùng LocalTuya |
| Thẻ báo **MẤT KẾT NỐI** | Entity `unavailable`/`unknown` | Kiểm tra pin cảm biến, hub, mạng |
| Mốc **khớp** SmartLife nhưng nhật ký vẫn thiếu | Lỗi ở tích hợp này | Bật log: thêm vào `configuration.yaml` → `logger: logs: custom_components.cua_cuon: debug` rồi gửi log |

Từ **v1.1.0** tích hợp có **lưới an toàn**: mỗi 60 giây đối chiếu trạng thái thật của cảm biến với
trạng thái đang giữ; nếu lệch (sự kiện `state_changed` bị lọt) thì **tự vá nhật ký + gửi thông báo**,
đồng thời ghi cảnh báo vào log HA. Số lần đã vá hiện ngay trên thẻ **📡 Cảm biến**.

## Có ghi nhật ký nhưng KHÔNG có thông báo? (v1.3.0)

Panel có thẻ **🔔 Thông báo** cho biết: dịch vụ `notify.*` đang cấu hình **còn tồn tại trong HA
không**, **lần gửi gần nhất** lúc mấy giờ, thành công hay lỗi gì, kèm nút **🔔 Gửi thử**.

| Thẻ báo | Nghĩa là | Cách xử lý |
|---|---|---|
| *KHÔNG CÒN dịch vụ này trong HA* | Điện thoại đăng ký lại (cài lại app, đổi tên máy, đăng xuất/đăng nhập) → **tên dịch vụ đã đổi** | **Configure** → chọn lại đúng `notify.mobile_app_…` đang có |
| Lần gửi cuối **THẤT BẠI** + dòng lỗi đỏ | HA có gọi nhưng dịch vụ trả lỗi | Đọc dòng lỗi; thường là thiết bị hết đăng ký hoặc máy chủ đẩy từ chối → đăng nhập lại app HA trên điện thoại |
| Gửi thử báo **thành công** nhưng điện thoại im | HA đã làm xong phần của nó | Lỗi phía máy: quyền thông báo, chế độ Tập trung/Focus, tiết kiệm pin, tắt tiếng thông báo của app HA |
| *chưa gửi lần nào* dù cửa có đóng/mở | Tích hợp **không gọi** notify | Xem thẻ 📡 Cảm biến + bật log debug (dưới) |

> ⚠️ **Từ v1.3.0 lệnh notify được gọi ở chế độ chờ kết quả (`blocking=True`).** Trước đó gọi kiểu
> "bắn rồi quên" nên lỗi xảy ra bên trong dịch vụ notify **rơi vào task nền và không bao giờ bay
> về tích hợp** — hỏng âm thầm, log sạch trơn, không ai biết. Giờ lỗi được ghi ở mức **ERROR**
> trong log HA và hiện thẳng trên panel.

## Hành trình bị hở — chốt tay bằng cách vuốt trái (v1.2.0)

Mất wifi / cảm biến lag / pin yếu → có khi **tín hiệu đóng không tới HA**, lượt đó treo mãi ở
*"đang mở"*, giờ mở cứ chạy tiếp và cảnh báo nhắc lặp lại không dừng.

Dòng bị hở được đánh dấu **viền nét đứt** kèm chữ *"← vuốt để chốt"*. **Vuốt dòng đó sang trái**
(trên máy tính thì kéo chuột) → lộ nút **✓ Kết thúc hành trình**. Bấm vào:

- Thiếu **điểm cuối** → đóng lại tại `giờ mở + 60 giây`.
- Thiếu **điểm đầu** → mở tại `giờ đóng − 60 giây`.
- Nếu đó là lượt đang treo → **cửa được coi như đã đóng**: thẻ trạng thái về *ĐÃ ĐÓNG* và
  **cảnh báo nhắc lặp dừng ngay**.

Lượt đã chốt tay mang nhãn **✍ chốt tay** — để sau này nhìn lại còn biết thời lượng đó là **ước
lượng**, không phải đo thật. Lưới an toàn 60 giây cũng được dặn **không mở lại** lượt vừa chốt
(cho tới khi cảm biến thật sự gửi trạng thái mới), nên bấm một lần là yên.

## Cập nhật
Có bản mới → HACS báo **Update** (hoặc `git pull` nếu chép tay). Không cần cấu hình lại.

## Cấu trúc
```
custom_components/cua_cuon/
├── __init__.py       # theo dõi cảm biến + thông báo + nhật ký + panel + WebSocket
├── config_flow.py    # chọn cảm biến, kênh thông báo, ngưỡng cảnh báo
├── const.py
├── manifest.json
├── panel.js          # màn hình nhật ký đóng/mở (Web Component)
├── strings.json + translations/
hacs.json
```

> Dự án anh em (khác): [`ha-chuong-cua`](https://github.com/l3th2nh/ha-chuong-cua) — thông báo khi
> **bấm chuông cửa**. Repo này chỉ lo **sự kiện đóng/mở cửa cuốn**.
