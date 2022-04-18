load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

# emsdk 3.1.8
http_archive(
    name = "emsdk",
    strip_prefix = "emsdk-2346baa7bb44a4a0571cc75f1986ab9aaa35aa03/bazel",
    url = "https://github.com/emscripten-core/emsdk/archive/2346baa7bb44a4a0571cc75f1986ab9aaa35aa03.tar.gz",
)

load("@emsdk//:deps.bzl", emsdk_deps = "deps")
emsdk_deps()

load("@emsdk//:emscripten_deps.bzl", emsdk_emscripten_deps = "emscripten_deps")
emsdk_emscripten_deps(emscripten_version = "3.1.8")

# bazel-compdb
http_archive(
    name = "com_grail_bazel_compdb",
    strip_prefix = "bazel-compilation-database-0.5.2",
    urls = ["https://github.com/grailbio/bazel-compilation-database/archive/0.5.2.tar.gz"],
)

load("@com_grail_bazel_compdb//:deps.bzl", "bazel_compdb_deps")
bazel_compdb_deps()
