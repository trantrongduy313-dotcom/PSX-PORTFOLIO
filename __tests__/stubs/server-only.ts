// Bản rỗng thay cho gói "server-only" khi chạy test.
//
// Gói thật cố ý ném lỗi nếu bị nạp ngoài môi trường server của Next — đúng cho lúc build,
// nhưng khiến vitest không nạp được các module business đánh dấu server-only. Alias tới file
// này trong vitest.config.ts để test được logic nghiệp vụ mà vẫn giữ nguyên bảo vệ khi build.
export {};
