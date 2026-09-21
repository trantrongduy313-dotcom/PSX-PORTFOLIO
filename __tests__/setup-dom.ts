import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Import THẲNG từ file test component, KHÔNG khai ở `setupFiles`.
//
// Khai toàn cục thì 128 file test đều nạp @testing-library — đo được: tổng thời lượng 20s lên
// 45s, riêng pha setup 196s. Test thuần không cần DOM, và không nên trả giá cho nó.

// Không dọn thì cây DOM của test trước còn nguyên, và `getByRole` sẽ tìm thấy hai phần tử rồi
// ném "found multiple elements" — một lỗi trông như lỗi của test đang chạy.
afterEach(cleanup);
