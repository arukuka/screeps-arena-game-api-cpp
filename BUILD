load("@rules_cc//cc:defs.bzl", "cc_binary")
load("@emsdk//emscripten_toolchain:wasm_rules.bzl", "wasm_cc_binary")

load("@com_grail_bazel_compdb//:defs.bzl", "compilation_database")
load("@com_grail_bazel_output_base_util//:defs.bzl", "OUTPUT_BASE")


BASE_LINKOPTS = [
    "--bind",  # Enable embind
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sENVIRONMENT=shell",
    "-sUSE_ES6_IMPORT_META=0",
    "-sSINGLE_FILE=1",
    "--pre-js",
    "loop-interface.js",
]

RELEASE_OPTS = [
    "--closure=1",  # Run the closure compiler
    # Tell closure about the externs file, so as not to minify our JS public API.
    "--closure-args=--externs=$(location loop-externs.js)"
]

DEBUG_OPTS = [
    "--closure=0",  # Do not use closure
]

config_setting(
    name = "release_opts",
    values = {"compilation_mode": "opt"},
)

config_setting(
    name = "debug_opts",
    values = {"compilation_mode": "dbg"},
)

cc_binary(
    name = "loop",
    srcs = ["loop.cc"],
    features = ["emcc_debug_link"],
    additional_linker_inputs = [
        "loop-externs.js",
        "loop-interface.js",
    ],
    linkopts = select({
        ":debug_opts": BASE_LINKOPTS + DEBUG_OPTS,
        ":release_opts": BASE_LINKOPTS + RELEASE_OPTS,
        "//conditions:default": BASE_LINKOPTS + DEBUG_OPTS,
    }),
    # This target won't build successfully on its own because of missing emscripten
    # headers etc. Therefore, we hide it from wildcards.
    tags = ["manual"],
)

wasm_cc_binary(
    name = "loop-wasm",
    cc_target = ":loop",
)


compilation_database(
    name = "compdb",
    targets = [
        ":loop",
        ":loop-wasm",
    ],
    output_base = OUTPUT_BASE,
)
