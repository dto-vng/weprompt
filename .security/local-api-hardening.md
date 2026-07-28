# D-01 / D-02 — khoá API local của AionCore

Trạng thái: phía AionUi đã xong. Phía AionCore đã có patch, chờ build và đổi pin.

## Hai finding

**D-01** — API local bỏ xác thực và mở CORS cho mọi origin.
**D-02** — Chính API đó trả `jwt_secret` và `password_hash` cho mọi origin.

Cả hai đều nằm trong **AionCore**, không nằm trong repo này. AionCore là một chương
trình Rust riêng, được tải về dưới dạng binary đã biên dịch theo pin
`package.json → aioncoreVersion`. Repo này không chứa source Rust.

## Reproduce trên bản đang pin (v0.1.50)

```
$ aioncore --port 19872 --data-dir ./data --local
$ curl -H "Origin: https://evil.example" http://127.0.0.1:19872/api/auth/internal/users

HTTP/1.1 200 OK
access-control-allow-origin: *

{"success":true,"data":[{"id":"system_default_user","username":"admin",
 "password_hash":"","jwt_secret":"vvXNGLzuDdfMr7/aSAnb+OCMHDmBh6y6K++OS6av30GJuhZ...",
 ...}]}
```

Nguyên nhân trong AionCore v0.1.50:

| Vị trí                                       | Nội dung                                                       |
| -------------------------------------------- | -------------------------------------------------------------- |
| `crates/aionui-auth/src/middleware.rs:52`    | `if state.local` → inject `system_default_user`, bỏ verify JWT |
| `crates/aionui-app/src/router/routes.rs:289` | `CorsLayer::allow_origin(Any)` + `allow_headers(Any)`          |
| `crates/aionui-app/src/router/routes.rs:261` | nhánh local bỏ luôn `csrf_middleware`                          |
| `crates/aionui-db/src/models/user.rs:8-19`   | `User` derive `Serialize` trên mọi cột, không skip 2 field mật |

Điểm kích hoạt trong repo này: `packages/web-host/src/backend-launcher.ts` —
desktop luôn spawn với `local: true`.

## Vì sao không bỏ `--local`

Đã test trực tiếp binary v0.1.50 ở chế độ non-local:

| Endpoint                    | non-local                                 |
| --------------------------- | ----------------------------------------- |
| `/api/providers`            | 401, không có header CORS, có CSRF cookie |
| `/api/auth/internal/users`  | 403 (`ensure_local_mode`)                 |
| `/api/webui/reset-password` | **403**                                   |

Non-local tự nó đóng cả hai finding, nhưng app không bootstrap được: fresh install
có `needs_setup: true` mà đường duy nhất đặt password ban đầu
(`/api/webui/reset-password`) lại bị `ensure_local_mode` chặn. Thêm nữa renderer
production load bằng `loadFile` nên origin là `file://`, cookie `aionui-session`
(`SameSite=Lax`) không gửi được cross-site.

## Cách xử lý

Giữ `--local` (không thêm bước đăng nhập, trải nghiệm người dùng không đổi) nhưng
dựng lại biên xác thực bằng **shared secret sinh mới mỗi lần khởi động**.

```
Electron main                          AionCore (--local)
─────────────                          ──────────────────
createLocalToken()  ── env ──────────▶  AIONUI_LOCAL_TOKEN
rendererAllowedOrigins() ── env ─────▶  AIONUI_LOCAL_ALLOWED_ORIGINS
      │                                        │
      ├─ globalThis.__backendLocalToken        ├─ local_token_middleware (layer toàn cục)
      │    (main-process callers)              │    header X-AionUI-Local-Token
      │                                        │    hoặc query ?local_token=
      └─ preload → window.__backendLocalToken  └─ CorsLayer chỉ allow origin đã khai báo
           (renderer)
```

### Ba quyết định đáng giải trình

**Secret truyền qua biến môi trường, không qua CLI flag.** `ps` đọc được argv trên
cả ba platform, nên một flag `--local-token <secret>` sẽ phát secret cho mọi
process local — đúng thứ đang cần chặn.

**Gate đặt ở layer toàn cục, không nằm trong `auth_middleware`.** Router của
AionCore có 6 nhóm route không đi qua `auth_middleware`: `/health`, `auth_routes`
(chứa chính `/api/auth/internal/*` của D-02), `ws_routes`, `runtime_team_tools`,
`office_proxy`, `public_assets`. Chỉ vá `auth_middleware` sẽ bỏ sót D-02.

Miễn trừ có chủ ý: `/health` (không có dữ liệu, supervisor poll trước khi biết
secret) và `/api/runtime/team-tools/*` (đã có runtime token riêng per-slot).

**Secret đi được cả trong query string.** `WebSocket`, `EventSource`, và `src` của
iframe/webview không set được header. Access log của AionCore chỉ ghi `query_keys`
(tên tham số) chứ không ghi giá trị.

### D-02 — DTO

Bốn handler đọc user và một handler create trả `InternalUserResponse` thay cho
`User`. DTO giữ nguyên mọi field trừ `password_hash` và `jwt_secret`. Chọn DTO
thay vì `#[serde(skip_serializing)]` để không có rủi ro round-trip
serialize/deserialize ở nơi khác trong AionCore.

## Thay đổi trong repo này

| File                                                       | Thay đổi                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/web-host/src/backend-launcher.ts`                | `createLocalToken()`, `BackendSecurityConfig`, `buildSpawnEnv` truyền env, getter `localToken`, sinh token mỗi lần spawn |
| `packages/desktop/src/index.ts`                            | `rendererAllowedOrigins()`, IPC `get-backend-local-token`, expose lên `globalThis`, token cho cron resume fetch          |
| `packages/desktop/src/preload/main.ts`                     | expose `__backendLocalToken`                                                                                             |
| `packages/desktop/src/common/adapter/httpBridge.ts`        | `getLocalToken`, `withLocalTokenHeaders`, `withLocalTokenQuery`; áp vào `httpRequest` + `getWsUrl`                       |
| `renderer/utils/platform.ts`                               | asset URL kèm query token                                                                                                |
| `renderer/services/FileService.ts`                         | header trên XHR upload                                                                                                   |
| `renderer/services/speech/SpeechStreamClient.ts`           | query token trên WS                                                                                                      |
| `renderer/components/settings/DirectorySelectionModal.tsx` | header                                                                                                                   |
| `.../channels/WeixinConfigForm.tsx`                        | query token trên `EventSource`                                                                                           |
| `process/bridge/webuiBridge.ts`                            | header                                                                                                                   |
| `process/utils/ensureAdminUser.ts`                         | header                                                                                                                   |
| `process/utils/resetPasswordCLI.ts`                        | header                                                                                                                   |

Chế độ WebUI không bị ảnh hưởng: `web-cli` và `scripts/webui.ts` không truyền
`local`, nên chạy ở chế độ xác thực thật (JWT + CSRF + cookie session).
`getLocalToken()` trả chuỗi rỗng ở đó và mọi helper thành no-op.

## Thay đổi trong AionCore

Fork: `khoapnt-vng/AionCore`, branch `security/local-api-token`, tách từ tag
`v0.1.50`.

| File                                     | Thay đổi                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `crates/aionui-auth/src/middleware.rs`   | `LocalTokenState`, `local_token_middleware`, `constant_time_eq`, + 6 test |
| `crates/aionui-auth/src/lib.rs`          | export                                                                    |
| `crates/aionui-app/src/router/routes.rs` | áp layer, thay `allow_origin(Any)` bằng allow-list từ env, thêm `max_age` |
| `crates/aionui-auth/src/routes.rs`       | `InternalUserResponse` + 5 handler + 3 test                               |

## Còn lại

1. Build AionCore đã patch cho `macos-arm64` và `windows-x64`
2. Đổi đường tiêu thụ AionCore trong repo này sang bản đã patch — hiện
   `package.json:274` vẫn pin `v0.1.50` của iOfficeAI và
   `packages/shared-scripts/src/prepare-aioncore.js:28` vẫn trỏ
   `GITHUB_OWNER = 'iOfficeAI'`. Repo đã có sẵn cơ chế cho việc này:
   `AIONUI_AIONCORE_SOURCE=forge` + `AIONUI_FORGE_SOURCE_REPO`
   (`prepare-aioncore.js:42-44`), verify bằng cosign signature — đã dùng cho
   Forge finding #1 trước đây.
3. Chạy lại repro ở đầu tài liệu, kỳ vọng 401 thay cho 200

**Cho tới khi bước 2 xong, bản build ra vẫn dùng binary chưa patch và cả hai
finding vẫn còn hở.** Phần thay đổi trong repo này chỉ là phía gửi secret.

## Một điểm fail-open có chủ ý

Nếu `AIONUI_LOCAL_TOKEN` không được set, AionCore giữ hành vi cũ và log
`tracing::warn!` thay vì từ chối khởi động. Lý do: test suite của AionCore dựng
router với `local: true` mà không có env, fail-closed sẽ phá toàn bộ. Desktop luôn
set biến này nên bản ship là fail-closed. Nếu cần chặt hơn thì đổi thành trả
`RouterBuildError` và sửa kèm test suite AionCore.
