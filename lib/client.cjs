window.__ModuleLoader__.load({id:"dsh-enhancement-switches",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  Switches: () => Switches,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "sessions"];
function Switches({ useProjection, choose }) {
  const state = useProjection("agentswitch");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  if (!state || state.child) return null;
  async function change(feature) {
    if (busy || !state) return;
    setBusy(true);
    setError("");
    try {
      await choose(feature, !state[feature]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-agentswitch", "aria-busy": busy, children: [
    ["ralph", "teams"].map((feature) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": state[feature],
        "aria-label": feature === "ralph" ? "Ralph Loop" : "Agent Teams",
        title: feature === "ralph" ? "\u4E3A\u5F53\u524D\u5BF9\u8BDD\u5F00\u653E Ralph \u5DE5\u5177\u3002\u8BF7\u5728\u6D88\u606F\u4E2D\u660E\u786E\u8981\u6C42\u8FED\u4EE3\u4EFB\u52A1\u3002\u5173\u95ED\u540E\uFF0C\u5DF2\u5F00\u59CB\u7684\u8C03\u7528\u53EF\u7EE7\u7EED\u5B8C\u6210\uFF0C\u4F7F\u7528\u505C\u6B62\u6309\u94AE\u53D6\u6D88\u3002" : "\u4E3A\u5F53\u524D\u5BF9\u8BDD\u53CA\u5176\u56E2\u961F\u6210\u5458\u5F00\u653E\u534F\u4F5C\u5DE5\u5177\u3002\u5173\u95ED\u540E\uFF0C\u5DF2\u5F00\u59CB\u7684\u5DE5\u4F5C\u53EF\u7EE7\u7EED\u5B8C\u6210\u3002",
        disabled: busy,
        onClick: () => void change(feature),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-agentswitch-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}) }),
          feature === "ralph" ? "Ralph Loop" : "Agent Teams"
        ]
      },
      feature
    )),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "alert", className: "dsh-agentswitch-error", children: error })
  ] });
}
function apply(ctx) {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = `
      /* Follow the host input card in both the blank and active conversation.
         The input dock itself spans the entire conversation column. */
      .dsh-agentswitch{
        --agentswitch-accent:var(--dsw-alias-state-business-primary,#4c70ee);
        box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:8px;
        width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px));
        max-width:var(--dsh-composer-card-max-width,780px);min-width:0;
        margin:0 auto;padding:2px 0;
      }
      .dsh-agentswitch button{
        box-sizing:border-box;display:inline-flex;align-items:center;gap:7px;
        min-height:28px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l2,#dce0e6);
        border-radius:999px;background:var(--dsw-specific-input-major,transparent);
        color:var(--dsw-alias-label-secondary,inherit);font:inherit;
        font-size:calc(12px + var(--dsh-content-font-delta-secondary,0px));line-height:18px;
        white-space:nowrap;cursor:pointer;
        transition:background-color .12s,border-color .12s,color .12s;
      }
      @media(hover:hover){.dsh-agentswitch button:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,#f3f5f8)}}
      .dsh-agentswitch button[aria-checked=true]{
        color:var(--agentswitch-accent);
        border-color:color-mix(in srgb,var(--agentswitch-accent) 45%,transparent);
        background:color-mix(in srgb,var(--agentswitch-accent) 8%,var(--dsw-specific-input-major,#fff));
      }
      .dsh-agentswitch button:focus-visible{outline:2px solid var(--agentswitch-accent);outline-offset:2px}
      .dsh-agentswitch button:disabled{opacity:.6;cursor:wait}
      .dsh-agentswitch-track{display:inline-flex;flex:none;align-items:center;width:24px;height:14px;border-radius:8px;background:var(--dsw-alias-label-tertiary,#87919e);padding:2px;box-sizing:border-box}
      .dsh-agentswitch-track span{width:10px;height:10px;background:white;border-radius:50%;transition:transform .12s}
      .dsh-agentswitch [aria-checked=true] .dsh-agentswitch-track{background:var(--agentswitch-accent)}
      .dsh-agentswitch [aria-checked=true] .dsh-agentswitch-track span{transform:translateX(10px)}
      .dsh-agentswitch-error{flex-basis:100%;font-size:12px;color:#d64545;overflow-wrap:anywhere}
      @media(prefers-reduced-motion:reduce){.dsh-agentswitch button,.dsh-agentswitch-track span{transition:none}}
    `;
    document.head.append(style);
    return () => style.remove();
  });
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "agentswitch",
    order: 110,
    label: "Enhancement Switches",
    inject: (sessionId) => ({
      async choose(feature, enabled) {
        const session = ctx.sessions.binding(sessionId)?.session;
        if (!session) throw new Error("\u4F1A\u8BDD\u6682\u4E0D\u53EF\u7528");
        const result = await session.command(`/agentswitch ${feature} ${enabled ? "on" : "off"}`);
        if (!result.ok) throw new Error(result.error.message);
        if (!result.value.matched) throw new Error("Enhancement Switches \u547D\u4EE4\u672A\u52A0\u8F7D");
      }
    })
  }, Switches));
}
return module.exports;}});
